// @ts-check

(function() {

  
  const template = document.createElement("template");
  template.innerHTML = `
          <style>
          label {
              display: grid;
              grid-template-columns: 7fr 4fr;
              margin: 5px;
              padding: 5px;
              border-radius: 5px;
              border: solid gray 1px;
              background-color: whitesmoke;
          }
          label > span {
            white-space:nowrap;
            padding-right: 6px;
          }
          </style>
          <label id="select"><span></span><select></select> </label>
      `;

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

  class DBForeign extends HTMLElement {
    constructor() {
      super();
      const now = new Date();
      this.signature = this.id + "_" + now.getMilliseconds();
      this.mono = false; // more than one value - triggered by select change
      this.foreign = "";
      this.selected = ""; // set this if used inside of db-update
      this.field = "";
      this.silent = ""; // non empty stops emitting events
      this.sql = "";
      this._type = "number";
      this.values = "";
      this._root = this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._root
        .querySelector("#select > select")
        .addEventListener("change", e => {
          this.trigger({ field: this.field }, `dbFrom-${this.id}`);
        });
    }

    /**
     * foreign  the foreign key connected to this select (book.bookid)
     * field    the field that supplies text for choosing (book.title to choose book.bookid)
     * label    shown as text before select
     * sql      sql that supplies a list of (foreign,field) to feed into make-select
     * type     default is number
     * table    listen for updates on this table if set
     * values   construct select from these values - alternative to sql
     * silent   don't emitt events
     * selected id of db-update that delivers current selected value
     *          listen for event telling which value is selected.
     *          needed for a foreign key to work with update
     *          the record has a value for the fk, but allow user to change it
     */
    static get observedAttributes() {
      return [
        "foreign",
        "label",
        "field",
        "sql",
        "type",
        "table",
        "values",
        "selected",
        "silent"
      ];
    }

    connectedCallback() {
      // only one value - can't change so trigger in a little while
      // wait for other components to exist
      // can use
      if (this.mono && this.sql === "")
        setTimeout(
          () => this.trigger({ field: this.field }, `dbFrom-${this.id}`),
          300
        );
    }

    /*
    get id() {
      const select = this._root.querySelector("#select > select");
      return select.id;
    }
    */

    get value() {
      const select = this._root.querySelector("#select > select");
      return select.value;
    }

    get type() {
      return this._type;
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
      const lbl = this._root.querySelector("#select > span");
      const select = this._root.querySelector("#select > select");
      if (name === "label") {
        this.label = newValue;
        lbl.innerHTML = newValue.charAt(0).toUpperCase() + newValue.substr(1);
      }
      if (name === "field") {
        this.field = newValue;
      }
      if (name === "silent") {
        this.silent = newValue;
      }
      if (name === "selected") {
        this.selected = newValue;
        // this component gets current selected value from a db-update
        const id = this.selected;
        addEventListener(`dbFrom-${id}`, e => {
          // db-update emits event when fields are available (prev,next,initial)
          const current = document.getElementById(id).value;
          if (!current) return;
          const myvalue = current[this.field] || "";
          setSelected(select, myvalue);
        });
      }
      if (name === "foreign") {
        const [foreign, local] = newValue.split(":");
        this.foreign = foreign;
        this.local = local ? local : foreign;
        select.id = this.local;
        if (this.id === "") this.id = this.local;
      }
      if (name === "values") {
        this.values = newValue;
        const list = this.values.split(",");
        const options = list
          .map(e => {
            const [name, _value] = e.split(":");
            const value = _value ? _value : name;
            return `<option value="${value}">${name}</option>`;
          })
          .join("");
        select.innerHTML = options;
        this.mono = list.length === 1;
      }
      if (name === "type") {
        this._type = newValue;
      }
      if (name === "table") {
        // if dbUpdate of this table then rerun the sql
        this.table = newValue;
        if (this.selected !== "") {
          console.log("Either table or selected");
        } else
          addEventListener("dbUpdate", e => {
            const source = e.detail.source;
            const table = e.detail.table;
            if (this.table === table && this.sql)
              this.makeSelect(select, this.sql, this.foreign, this.field);
          });
      }
      if (name === "sql") {
        this.sql = newValue;
        this.makeSelect(select, this.sql, this.foreign, this.field);
      }
    }

    // assumes foreign key has same name in both tables
    // bok.forfatterid references forfatter.forfatterid
    makeSelect(select, sql, foreign, field) {
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
          console.log(data);
          const list = data.results;
          if (list.length) {
            const options =
              '<option value="">..velg..</option>' +
              list
                .map(e => `<option value="${e[foreign]}">${e[field]}</option>`)
                .join("");
            select.innerHTML = options;
          }
        });
    }
  }

  window.customElements.define("db-foreign", DBForeign);
})();
