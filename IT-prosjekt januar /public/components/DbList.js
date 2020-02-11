// @ts-check

/* This component runs a sql-query and fills a template with returned values.
   The template can be any (but not table,td,tr,th) element and
   can contain subelements. Any ${xxx} will be replaced with values
   returned from the query. If the query returns multiple rows - then
   the template will be repeated.
   The component can be placed inside <ol> <ul> and then a <li> template
   behaves as you would expect. <tr> template inside a <table> works notte.
*/

(function() {
  const template = document.createElement("template");
  const base = `<style> .error { box-shadow: inset 0 0 5px red; animation: blink 1s alternate infinite;}
              @keyframes blink { 100% { box-shadow:inset 0 0 0 red; } }
              .empty { display:none; }
             </style> 
             #import#  
             <div id="main"><slot></slot></div>`;

  class DBList extends HTMLElement {
    constructor() {
      super();
      const now = new Date();
      this.signature = this.id + "_" + now.getMilliseconds();
      this.loaded = false;
      this.sql = "";
      this.silent = "";
      this.import = "";
      this.connected = "";
      this.update = "";
      this.service = "/runsql"; // default service
      this._root = this.attachShadow({ mode: "open" });
      // shadowRoot.append moved to callback
      // - so that any cssimport can be added to base before append
    }

    /**
     * sql        select for fields
     * connected  listen for event emitted by this component
     * cssimport  import css-file
     * update     redraw when this table changes
     * silent     don't emit events
     * service    where to post sql - /runsql
     */
    static get observedAttributes() {
      return ["sql", "service", "cssimport", "connected", "update", "silent"];
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

    /**
     * Picks out usertemplate from slot and replicates it for all rows in
     * returned query result. Values are interpolated into ${fieldname} in template
     * @param {Array} data is array returned from query [ {field:value, ...}, ..]
     */
    feedResultsToTemplate(data, divMain) {
      const list = data.results;
      if (list.error) {
        divMain.classList.add("error");
        divMain.title = this.sql + "\n" + list.error;
      } else {
        const items = Array.from(divMain.querySelectorAll("slot"));
        if (items && items.length) {
          const elements = items[0].assignedElements();
          if (elements.length !== 1) {
            // one and only one accepted
            divMain.classList.add("error");
            divMain.innerHTML = elements.length
              ? "Only one top level element allowed"
              : "Missing template element";
            return;
          }
          const userTemplate = elements[0];
          if (userTemplate && list.length) {
            userTemplate.style.display = ""; // remove none
            divMain
              .querySelectorAll(".__block")
              .forEach(e => e.parentNode.removeChild(e));
            list.forEach(e => {
              const copy = userTemplate.cloneNode(true);
              const replaced = document
                .createRange()
                .createContextualFragment(fill(copy, e));
              copy.innerHTML = "";
              copy.classList.add("__block");
              copy.append(replaced);
              divMain.append(copy);
            });
            userTemplate.style.display = "none"; // hide template
            this.trigger({}, `dbFrom-${this.id}`); // inform interested listeners
          }
        }
      }
    }

    redraw(sql, divMain, service) {
      divMain.classList.remove("empty", "error");
      const init = {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sql }),
        headers: {
          "Content-Type": "application/json"
        }
      };
      fetch(service, init)
        .then(r => r.json())
        .then(data => this.feedResultsToTemplate(data, divMain));
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "service") {
        this.service = newValue;
      }
      if (name === "cssimport") {
        this.import = `<style>@import "${newValue}";</style>`;
        template.innerHTML = base.replace("#import#", this.import);
        if (this.loaded) {
          const divMain = this._root.querySelector("#main");
          divMain.classList.add("error");
          divMain.innerHTML = "cssimport must be before sql";
        } else {
          this.shadowRoot.appendChild(template.content.cloneNode(true));
          this.loaded = true;
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
          const divMain = this._root.querySelector("#main");
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
              this.redraw(sql, divMain, this.service);
            } else {
              // we must redraw as empty
              const divMain = this._root.querySelector("#main");
              divMain.classList.add("empty");
              this.trigger({}, `dbFrom-${this.id}`); // cascade
              // as we emit dbFrom event - we won't respond ourself
            }
          }
        });
      }
      if (name === "silent") {
        this.silent = newValue;
      }
      if (name === "update") {
        this.update = newValue;
        addEventListener("dbUpdate", e => {
          const table = e.detail.table;
          const divMain = this._root.querySelector("#main");
          if (!divMain) return; // not ready
          if (this.update && this.update === table)
            this.redraw(this.refsql || this.sql, divMain, this.service);
        });
      }
      if (name === "sql") {
        const sql = (this.sql = newValue);
        if (!this.loaded) {
          // no css or it was not ready - must be placed before sql
          template.innerHTML = base.replace("#import#", "");
          this.shadowRoot.appendChild(template.content.cloneNode(true));
          this.loaded = true;
        }
        if (this.connected !== "") return; // must wait for event to trigger us
        const divMain = this._root.querySelector("#main");
        this.redraw(sql, divMain, this.service);
      }
    }
  }

  /**
   * Fills in a template "xxx ${key}" with value from values
   * @param {Object} node clone of template
   * @param {Object} values to fill into template
   */
  function fill(node, values) {
    const replaced = node.innerHTML;
    return replaced.replace(/\$\{(.+?)\}/g, (_, v) => {
      if (values[v]) {
        return values[v];
      } else {
        return `#${v}`;
      }
    });
  }

  window.customElements.define("db-list", DBList);
})();
