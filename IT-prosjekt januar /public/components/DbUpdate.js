// @ts-check

(function() {
  const template = document.createElement("template");
  template.innerHTML = `
        <style>
        .heading {
            text-align: center;
            font-size: 1.2em;
            color:blue;
        }
        form {
            position: relative;
            padding: 5px;
            border-radius: 5px;
            border: solid gray 1px;
            background-color: gainsboro;
            margin: 2em;
        }
        form::after {
          color:blue;
          content: "Oppdatering";
          position: absolute;
          right: 20px;
          top: -20px;
      }

        form > label {
            position: relative;
            left: 70%;
        }
        
        form  div label {
            display: grid;
            grid-template-columns: 7fr 4fr;
            margin: 5px;
            padding: 5px;
            border-radius: 5px;
            border: solid gray 1px;
            background-color: whitesmoke;
            text-transform:capitalize;
        }

        form  div#foreign label {
          grid-template-columns: 5fr 1fr 4fr;
        }

        span.foreign {
          color: green;
          font-size: 0.9em;
          padding-right:3px;
        }

        #next, #prev {
          width: 0px;
          height: 0px;
          position: absolute;
          right: -60px;
          top: calc(50% - 30px);
          border: solid 25px transparent;
        }
        #prev {
          left: -60px;
          border-right: solid gray 25px;
        }
        #next {
          border-left: solid gray 25px;
        }
        #lagre {
            background-color: antiquewhite;
        }
        div.heading {
          display: grid;
          grid-template-columns: 5fr 1fr;
        }
        .hidden {
          display:none;
        }
        form.invalid  {
          height: 1em;
          overflow:hidden;
        }
        </style>
        <form>
          <div class="heading"><slot name="heading"></slot><div id="number">1</div></div>
          <div id="fields"></div>
          <div id="foreign">
          </div>
          <div id="alien">
            <slot></slot>
          </div>
          <div id="next"></div>
          <div id="prev"></div>
          <label class="hidden"> &nbsp; <button type="button" id="save"><slot name="save">Save</slot></button></label>
        </form>
    `;

  // extend to more datatypes if needed
  const getval = e => {
    switch (e.type) {
      case "checkbox":
        return e.checked;
      case "number":
        return e.value !== "" ? Number(e.value) : 0;
      case "date":
        return e.value;
      default:
        return e.value;
    }
  };

  const assignInput = (inp, type, value) => {
    // NOTE (value == null) covers (value == undefined) also
    switch (type) {
      case "checkbox":
        inp.checked = value !== false;
        break;
      case "date":
        const date = value == null ? "" : value.split("T")[0];
        inp.value = date;
        break;
      default:
        const cleanValue = value === null ? "" : value;
        inp.value = cleanValue;
        break;
    }
  };

  const setSelected = (inp, value) => {
    const opts = Array.from(inp.options);
    for (const [i, o] of opts.entries()) {
      if (o.value == value) {
        inp.selectedIndex = i;
        return;
      }
    }
    inp.selectedIndex = -1; // non selected
  };

  class DBUpdate extends HTMLElement {
    constructor() {
      super();
      const now = new Date();
      this.signature = this.id + "_" + now.getMilliseconds();
      this.rows = [];
      this.silent = "";
      this.types = {}; // fields need typing so we can store dates and number correctly
      this.idx = 0;
      this.fields;
      this.foreign = [];
      this.aliens = []; // slotted db-foreign
      this.table = "";
      this.key = "";
      this.update = "";
      this.connected = "";
      this._root = this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));

      // this is code for creating sql insert statement
      this._root.querySelector("#save").addEventListener("click", e => {
        if (this.update) {
          const current = this.rows[this.idx]; // save any changes to the rows array
          const keyint = current[this.key];
          this.fieldlist.forEach(e => (current[e.id] = e.value));
          // aliens will pick out any db-foreign placed into alien-slot
          const aliens = Array.from(this._root.querySelectorAll("#alien slot"))
            .map(e => e.assignedElements()[0])
            .filter(e => e !== undefined);
          // the aliens overwrite values given by fieldlist
          aliens.forEach(e => {
            const { id, value } = e;
            current[id] = value;
          });
          const foreign = Array.from(
            this._root.querySelectorAll("#foreign select")
          );
          const inputs = Array.from(
            this._root.querySelectorAll("#fields input")
          )
            .concat(foreign)
            .concat(aliens)
            .filter(e => !e.disabled);
          const names = inputs.map(e => e.id);
          const fieldvalues = names.map(e => `${e}=$[${e}]`).join(",");
          // get value of input element - handles checkboxes
          const data = inputs.reduce((s, e) => ((s[e.id] = getval(e)), s), {});
          const table = this.table;
          const sql = `update ${table} set ${fieldvalues} where ${this.key} = ${keyint}`;
          this.upsert(sql, data);
        }
      });
      this._root.querySelector("#next").addEventListener("click", () => {
        this.idx = (this.idx + 1) % this.rows.length;
        this.show();
      });
      this._root.querySelector("#prev").addEventListener("click", () => {
        this.idx = (this.idx + this.rows.length - 1) % this.rows.length;
        this.show();
      });
    }

    /**
     * foreign    the foreign key connected to this select (book.bookid)
     * fields     fields to show in form
     *            must include fields that are used by db-foreign - "foreignid:ignore,"
     *            set type to ignore so that it is not used in form but included in
     *            fieldset returned by #id.value
     * table      update sql created for this table
     * key        key for update (where key=val)
     * connected  listen for emits from this component
     * silent     don't emit events
     *
     */
    static get observedAttributes() {
      return [
        "table",
        "key",
        "fields",
        "foreign",
        "update",
        "connected",
        "silent"
      ];
    }

    connectedCallback() {
      this.redraw();
    }

    get value() {
      const current = this.rows[this.idx];
      return current;
    }

    listen(e) {
      const source = e.detail.source;
      if (this.id === source) return; // triggered by self
      const [id, field] = this.connected.split(":");
      const table = e.detail.table;
      if (table === this.table) {
        // the table we are updating has changed
        this.redraw();
        return;
      }
      if (id !== source) return; // we are not interested
      const dbComponent = document.getElementById(id);
      if (dbComponent) {
        // component found - get its value
        const value = dbComponent.value || "";
        if (value !== "") {
          const intvalue = Math.trunc(Number(value));
          const rows = this.rows;
          const key = this.key;
          if (rows.length && key) {
            // find correct idx
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i];
              if (r[key] === intvalue) {
                // found correct row
                this.idx = i;
                this.show();
                return;
              }
            }
          }
        } else {
          // we must redraw as empty
          this._root.querySelector("form").classList.add("invalid");
          this.idx = undefined;
          this.trigger({}, `dbFrom-${this.id}`);
        }
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      const divFields = this._root.querySelector("#fields");
      const divForeign = this._root.querySelector("#foreign");
      if (name === "fields") {
        divFields.innerHTML = "";
        const rawfields = newValue.split(",");
        const fieldlist = rawfields.map(h => {
          const [name, type = "text"] = h.split(":");
          return { name, type };
        });
        this.fields = fieldlist.map(e => e.name);
        const readonly = this.update === "";
        for (let f of fieldlist) {
          // ignored fields are used by db-foreign
          if (f.type !== "ignore") {
            const label = document.createElement("label");
            const disabled = f.name === this.key || readonly ? " disabled" : ""; // can not change key
            label.innerHTML = `${f.name} <input type="${f.type}" id="${f.name}" ${disabled}>`;
            divFields.appendChild(label);
          }
        }
        this.fieldlist = fieldlist
          .map(e => this._root.querySelector("#" + e.name))
          .filter(e => e); // remove null (xxx:ignore)

        this.types = fieldlist.reduce((s, e) => {
          s[e.name] = e.type;
          return s;
        }, {});
      }
      if (name === "table") {
        this.table = newValue;
      }
      if (name === "silent") {
        this.silent = newValue;
      }
      if (name === "update") {
        this.update = newValue;
        this._root.querySelector("label.hidden").classList.remove("hidden");
        addEventListener("dbUpdate", e => {
          const table = e.detail.table;
          if (this.update && this.update === table)
            this.redraw();
        });
      }
      if (name === "key") {
        this.key = newValue;
      }
      if (name === "connected") {
        this.connected = newValue;
        const [id, field] = this.connected.split(":");
        addEventListener(`dbFrom-${id}`, e => this.listen(e));
        // this component depends on another
        this._root.querySelector("#next").classList.add("hidden");
        this._root.querySelector("#prev").classList.add("hidden");
        //addEventListener("dbUpdate", e => this.listen(e));
      }
      if (name === "foreign") {
        divForeign.innerHTML = "";
        const fieldlist = newValue.split(",");
        for (let i = 0; i < fieldlist.length; i++) {
          const [table, fields] = fieldlist[i].split(".");
          let [field, use] = fields.split(":");
          use = use || field;
          const text = use.charAt(0).toUpperCase() + use.substr(1);
          const label = document.createElement("label");
          label.innerHTML = `${text} <span class="foreign">fra&nbsp;${table}</span> <select id="${field}"></select>`;
          divForeign.appendChild(label);
          this.makeSelect(table, field, use);
          this.types[field] = "number";
          this.foreign.push(field); // needed for select sql
          this.addEventListener("ready", () => {
            const current = this.rows[this.idx];
            Array.from(
              this._root.querySelectorAll("#foreign select")
            ).forEach(e => setSelected(e, current[e.id]));
          });
        }
      }
    }

    trigger(detail, eventname = "dbUpdate") {
      if (this.silent !== "") return;
      detail.source = this.id;
      this.dispatchEvent(
        new CustomEvent(eventname, {
          bubbles: true,
          composed: true,
          detail
        })
      );
    }

    show() {
      // places data for row[idx] in form for editing
      if (this.idx != null && this.rows.length && this.fieldlist.length) {
        this._root.querySelector("form").classList.remove("invalid");
        const current = this.rows[this.idx];
        //assignInput
        this.fieldlist.forEach(e =>
          e ? assignInput(e, this.types[e.id], current[e.id]) : 0
        );
        this._root.querySelector("#number").innerHTML =
          "#" + String(this.idx + 1);
        this.trigger({}, `dbFrom-${this.id}`);
        this.trigger({}, "ready");
      }
    }

    redraw() {
      if (this.table && this.key) {
        const table = this.table;
        const key = this.key;
        const fields = this.fields || "*";
        const foreign = this.foreign.length ? "," + this.foreign.join(",") : "";
        const keyfields = key + "," + fields + foreign;
        const sql = `select ${keyfields} from ${table} order by ${key}`;
        const init = {
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ sql }),
          headers: {
            "Content-Type": "application/json"
          }
        };
        fetch("/runsql", init)
          .then(r => r.json())
          .then(data => {
            // console.log(data);
            const list = data.results;
            if (list.length) {
              this.rows = list;
              this.show();
            }
          });
      }
    }

    // assumes foreign key has same name in both tables
    // bok.forfatterid references forfatter.forfatterid
    makeSelect(table, field, use) {
      const fields = field === use ? field : `${field}, ${use}`;
      const sql = `select ${fields} from ${table} order by ${use}`;
      const data = "";
      const init = {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sql, data }),
        headers: {
          "Content-Type": "application/json"
        }
      };
      fetch("/runsql", init)
        .then(r => r.json())
        .then(data => {
          //console.log(data);
          const list = data.results;
          if (list.length) {
            const options =
              '<option value="">..velg..</option>' +
              list
                .map(e => `<option value="${e[field]}">${e[use]}</option>`)
                .join("");
            this._root.querySelector(`#${field}`).innerHTML = options;
          }
        });
      //.catch(e => console.log(e.message));
    }

    upsert(sql = "", data) {
      const init = {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sql, data }),
        headers: {
          "Content-Type": "application/json"
        }
      };
      //console.log(sql, data);
      fetch("/runsql", init)
        .then(() => {
          // others may want to refresh view
          this.trigger({ sig: this.signature, table: this.table });
          this.show();
        })
        .catch(e => console.log(e.message));
    }
  }

  window.customElements.define("db-update", DBUpdate);
})();
