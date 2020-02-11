// @ts-check

(function() {
  const template = document.createElement("template");
  template.innerHTML = `
          <style>
            table {
              width: var(--tsize, 100%);
              border-collapse:collapse;
            }
            #thead {
              background-color: var(--head, beige);
            }
            th {
              text-transform: capitalize;
            }
            td,th {
              border: solid gray 1px;
              padding: 2px;
            }
            tr {
              background-color: var(--alternate, lightsteelblue);
            }
            caption {
              color:blue;
              font-size: 1.1em;
            }
            td.text {
              text-align: left;
              padding-left: 10px;
            }
            th.hidden,
            td.hidden {
              display:none;
            }
            td.true, td.false {
              text-align: center;
              color: green;
              font-size: 1.2rem;
            } 
            td.false {
              color:red;
            }
            td.number {
              text-align: right;
              color: black;
              padding-right: 10px;
            }
            th button {
              color:red;
              font-size: 1.1rem;
              font-weight:bold;
            }
            tr.selected {
              box-shadow: inset 0 0 5px blue;
            }
            table.error thead tr {
              box-shadow: inset 0 0 5px red, 0 0 0 orange;
              animation: pulse 1s alternate infinite;
            }
            @keyframes pulse {
              100% { box-shadow: inset 0 0 2px black, 0 0 6px red; }
            }
          </style>
          <table>
            <caption><slot name="caption"></slot></caption>
            <thead>
              <tr id="thead"></tr>
            </thead>
            <tbody id="tbody">
            </tbody>
          </table>
      `;

  const formatField = (type, value) => {
    // NOTE (value == null) covers (value == undefined) also
    switch (type) {
      case "boolean":
        return value
          ? { type: "true", value: "✓" }
          : { type: "false", value: "✗" };
      case "number":
        return { type, value: +value };
      case "money":
        return { type: "number", value: (+value).toFixed(2) };
      case "int":
        return { type: "number", value: Math.trunc(+value) };
      case "date":
        const date = value == null ? "" : value.split("T")[0];
        return { type, value: date };
      default:
        const cleanValue = value === null ? "" : value;
        return { type, value: cleanValue };
    }
  };

  class DBTable extends HTMLElement {
    constructor() {
      super();
      const now = new Date();
      this.selectedRow;
      this.signature = this.id + "_" + now.getMilliseconds();
      this.rows = []; // data from sql
      this.key = "";
      this.silent = ""; // emit no events
      this.refsql = ""; // set if updated by dbupdate - reused by simple refresh
      this.delete = "";
      this.connected = ""; // use given db-component as where, assumed to implement get.value
      // also assumed to emit dbUpdate
      this._root = this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      addEventListener("dbUpdate", e => {
        const table = e.detail.table;
        if (this.update && this.update === table)
          this.redraw(this.refsql || this.sql);
      });
      // can set focus on a row in table
      const divBody = this._root.querySelector("#tbody");
      divBody.addEventListener("click", e => {
        const prev = divBody.querySelector("tr.selected");
        if (prev) prev.classList.remove("selected"); // should be only one
        let t = e.target;
        while (t && t.localName !== "tr") {
          t = t.parentNode;
        }
        if (t && t.dataset && t.dataset.idx) {
          t.classList.add("selected");
          this.selectedRow = Number(t.dataset.idx);
          this.trigger({ row: this.selectedRow }, `dbFrom-${this.id}`);
        }
      });
    }

    /**
     * key        fields[key] is returned as value by this component
     * fields     the fields to show in form
     * sql        select for fields
     * connected  listen for event emitted by this component
     * delete     allow deletes
     * update     redraw when this table changes
     * silent     don't emit events
     */
    static get observedAttributes() {
      return [
        "fields",
        "sql",
        "update",
        "key",
        "connected",
        "delete",
        "silent"
      ];
    }

    connectedCallback() {
      // only make initial redraw if not connected
      // a connected table must be triggered by event
      if (this.connected === "") {
        this.redraw(this.sql);
      }
    }

    get value() {
      if (this.selectedRow === undefined) {
        return undefined;
      }
      const current = this.rows[this.selectedRow];
      return current[this.key];
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

    attributeChangedCallback(name, oldValue, newValue) {
      const divThead = this._root.querySelector("#thead");
      const divBody = this._root.querySelector("#tbody");
      if (name === "fields") {
        divThead.innerHTML = "";
        const fieldlist = newValue.split(",");
        const headers = fieldlist.map(h => {
          const [name, type = "text"] = h.split(":");
          return { name, type };
        });
        this.fieldlist = headers;
        for (let { name, type } of headers) {
          const th = document.createElement("th");
          th.innerHTML = name;
          th.className = type;
          divThead.appendChild(th);
        }
      }
      if (name === "connected") {
        this.connected = newValue;
        // this component depends on an other specific component
        const [id, field] = this.connected.split(":");
        addEventListener(`dbFrom-${id}`, e => {
          // const source = e.detail.source;
          // if (this.id === source) return; // triggered by self
          const dbComponent = document.getElementById(id);
          if (dbComponent) {
            // component found - get its value
            const value = dbComponent.value || "";
            if (value !== "") {
              // check that sql does not have where clause and value is int
              let sql = this.sql;
              const intvalue = Math.trunc(Number(value));
              if (sql.includes("where") || !Number.isInteger(intvalue)) return; // do nothing
              sql += ` where ${field} = ${intvalue}`; // value is integer
              this.refsql = sql; // reuse if refreshed by update
              this.redraw(sql);
            } else {
              // we must redraw as empty
              const divBody = this._root.querySelector("#tbody");
              divBody.innerHTML = "";
              this.selectedRow = undefined;
              this.trigger({}, `dbFrom-${this.id}`); // cascade
            }
          }
        });
      }
      if (name === "sql") {
        this.sql = newValue;
      }
      if (name === "silent") {
        this.silent = newValue;
      }
      if (name === "key") {
        this.key = newValue;
      }
      if (name === "update") {
        this.update = newValue;
      }
      if (name === "delete") {
        // must be name of table to delete from
        // first field of fields will be used as shown
        // delete from tablename where field in ( collect field.value of checked rows)
        // the first field value is stored on checkbox to make this easy
        this.delete = newValue;

        const th = document.createElement("th");
        th.innerHTML = "<button>x</button>";
        divThead.appendChild(th);
        divThead.querySelector("button").addEventListener("click", () => {
          const table = this.delete;
          const leader = this.fieldlist[0].name;
          const selected = Array.from(divBody.querySelectorAll("input:checked"))
            .map(e => e.value)
            .join(",");
          const sql = `delete from ${table} where ${leader} in (${selected})`;
          const data = {};
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
              const list = data.results; // check for errors
              const htmltable = this._root.querySelector("table");
              if (list.error) {
                htmltable.classList.add("error");
                htmltable.title = sql + "\n" + list.error;
                return;
              } else {
                this.trigger({ sig:this.signature, delete: true, table });
              }
            })
            .catch(e => console.log(e.message));
        });
      }
    }

    redraw(sql) {
      this.selectedRow = undefined;
      const divBody = this._root.querySelector("#tbody");
      if (this.sql && divBody) {
        //const sql = this.sql;
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
            const htmltable = this._root.querySelector("table");
            if (list.error) {
              htmltable.classList.add("error");
              htmltable.title = sql + "\n" + list.error;
              return;
            }
            htmltable.classList.remove("error");
            htmltable.title = "";
            this.rows = list; // so we can pick values
            let rows = "";
            const headers = this.fieldlist;
            const chkDelete = this.delete;
            const leader = headers[0].name; // name of first field
            if (list.length) {
              rows = list
                .map(
                  (e, i) =>
                    `<tr data-idx="${i}">${headers
                      .map((h, i) => {
                        const { value, type } = formatField(h.type, e[h.name]);
                        return `<td class="${type}">${value}</td>`;
                      })
                      .join("")} ${
                      chkDelete
                        ? `<td><input type="checkbox" value="${e[leader]}"></td>`
                        : ""
                    }</tr>`
                )
                .join("");
            }
            divBody.innerHTML = rows;
            this.trigger({}, `dbFrom-${this.id}`); // dependents may redraw
          });
      }
    }
  }

  window.customElements.define("db-table", DBTable);
})();
