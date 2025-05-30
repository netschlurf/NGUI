
  /**
   * -----------------------------------
   * NGUITreeGrid itself is a generic UI helper and does NOT fetch or render data on its own.
   * 
   * You are responsible for:
   *   1. Fetching or preparing your data (e.g. from backend, API, or static array).
   *   2. Rendering your data as <tr> rows inside your table's <tbody> (e.g. <tbody id="logOutput">).
   *      - You can use your own render function or template logic.
   *      - Each row should have a unique identifier (e.g. data-row-index or data-dpname).
   *   3. After rendering the rows, call:
   *        - this.enableRowSelection();   // enables selection logic
   *        - this.enableTreeToggle();     // enables expand/collapse logic (if you use tree structure)
   * 
   * Example:
   *   class MyGrid extends NGUITreeGrid {
   *     renderRows(data) {
   *       let html = "";
   *       data.forEach(item => {
   *         html += `<tr data-row-index="${item.id}"><td>${item.name}</td></tr>`;
   *       });
   *       document.getElementById("logOutput").innerHTML = html;
   *       this.enableRowSelection();
   *       this.enableTreeToggle();
   *     }
   *   }
   * 
   * In summary:
   * - NGUITreeGrid provides the interactive grid logic.
   * - YOU provide the data and render the rows.
   * - After rendering, activate the grid features by calling the enable* methods.
   */
  class NGUITreeGrid {
    constructor() {
      this.selectedRows = new Set();
      this.lastSelectedIndex = null;
      this.isMouseDown = false;
      this.mouseSelectStart = null;
        this.initEventHandlers();
      }

      /**
       * Initialize generic event handlers (e.g. for column resizing).
       */
      initEventHandlers() {
        document.addEventListener("DOMContentLoaded", this.enableColumnResize.bind(this));
      }

      /**
       * Enable drag & drop resizing for table columns.
       */
      enableColumnResize() {
        const table = document.querySelector("table.min-w-full");
        if (!table) return;
        const ths = table.querySelectorAll("th");
        ths.forEach(th => {
          th.style.position = "relative";
          const resizer = document.createElement("div");
          resizer.style.width = "5px";
          resizer.style.height = "100%";
          resizer.style.position = "absolute";
          resizer.style.right = "0";
          resizer.style.top = "0";
          resizer.style.cursor = "col-resize";
          resizer.style.userSelect = "none";
          resizer.style.zIndex = "10";
          th.appendChild(resizer);
          let startX, startWidth;
          resizer.addEventListener("mousedown", function (e) {
            startX = e.pageX;
            startWidth = th.offsetWidth;
            document.documentElement.style.cursor = "col-resize";
            document.addEventListener("mousemove", mousemove);
            document.addEventListener("mouseup", mouseup);
            e.preventDefault();
          });
          function mousemove(e) {
            const newWidth = startWidth + (e.pageX - startX);
            th.style.width = newWidth + "px";
          }
          function mouseup() {
            document.documentElement.style.cursor = "";
            document.removeEventListener("mousemove", mousemove);
            document.removeEventListener("mouseup", mouseup);
          }
        });
      }

      /**
       * Enable row selection with support for multi-select and mouse drag.
       */
      enableRowSelection() {
        const rows = Array.from(document.querySelectorAll('#logOutput tr'));
        rows.forEach((tr, idx) => {
          tr.setAttribute('data-row-index', idx);
          if (!tr.hasAttribute('data-dpname')) {
            const dpName = tr.querySelector('td')?.innerText?.trim();
            tr.setAttribute('data-dpname', dpName);
          }
          tr.addEventListener('mousedown', e => this.handleRowMouseDown(e, tr, idx, rows));
          tr.addEventListener('mouseenter', e => this.handleRowMouseEnter(e, tr, idx, rows));
          tr.addEventListener('mouseup', () => this.handleRowMouseUp());
        });
        document.addEventListener('mouseup', () => this.handleRowMouseUp());
      }

      /**
       * Internal: handle mouse down for row selection.
       */
      handleRowMouseDown(e, tr, idx, rows) {
        this.isMouseDown = true;
        this.mouseSelectStart = idx;
        if (e.ctrlKey || e.metaKey) {
          if (this.selectedRows.has(tr)) {
            this.selectedRows.delete(tr);
            tr.classList.remove('selected-row');
          } else {
            this.selectedRows.add(tr);
            tr.classList.add('selected-row');
          }
          this.lastSelectedIndex = idx;
          this.updateSelection();
        } else if (e.shiftKey && this.lastSelectedIndex !== null) {
          const [start, end] = [this.lastSelectedIndex, idx].sort((a, b) => a - b);
          rows.forEach((row, i) => {
            if (i >= start && i <= end) {
              this.selectedRows.add(row);
              row.classList.add('selected-row');
            }
          });
          this.updateSelection();
        } else {
          this.selectedRows.forEach(row => row.classList.remove('selected-row'));
          this.selectedRows.clear();
          this.selectedRows.add(tr);
          tr.classList.add('selected-row');
          this.lastSelectedIndex = idx;
          this.updateSelection();
        }
      }

      /**
       * Internal: handle mouse enter for drag selection.
       */
      handleRowMouseEnter(e, tr, idx, rows) {
        if (this.isMouseDown && this.mouseSelectStart !== null && e.buttons === 1) {
          const [start, end] = [this.mouseSelectStart, idx].sort((a, b) => a - b);
          this.selectedRows.forEach(row => row.classList.remove('selected-row'));
          this.selectedRows.clear();
          for (let i = start; i <= end; i++) {
            this.selectedRows.add(rows[i]);
            rows[i].classList.add('selected-row');
          }
          this.updateSelection();
        }
      }

      /**
       * Internal: handle mouse up for selection.
       */
      handleRowMouseUp() {
        this.isMouseDown = false;
        this.mouseSelectStart = null;
      }

      /**
       * Called when the selection changes. Should be overridden in subclasses.
       */
      updateSelection() {
        // To be implemented in derived class
      }

      /**
       * Enable tree expand/collapse toggles for rows.
       */
      enableTreeToggle() {
        document.querySelectorAll('.toggle-btn').forEach(btn => {
          btn.addEventListener('click', e => this.handleTreeToggle(e, btn));
        });
      }

      /**
       * Internal: handle expand/collapse click.
       */
      handleTreeToggle(e, btn) {
        const targetRowId = btn.getAttribute('data-target');
        const isCollapsed = btn.getAttribute('data-state') === "closed";
        const chevronRight = `<svg class="lucide lucide-chevron-right inline w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/></svg>`;
        const chevronDown = `<svg class="lucide lucide-chevron-down inline w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>`;
        btn.innerHTML = isCollapsed ? chevronDown : chevronRight;
        btn.setAttribute('data-state', isCollapsed ? "open" : "closed");
        this.toggleChildren(targetRowId, isCollapsed);
      }

      /**
       * Show/hide child rows for a given parent row.
       */
      toggleChildren(parentId, show) {
        const rows = document.querySelectorAll(`tr[data-parent="${parentId}"]`);
        rows.forEach(row => {
          row.style.display = show ? "" : "none";
          if (!show) {
            const toggle = row.querySelector('.toggle-btn');
            if (toggle) {
              toggle.innerHTML = `<svg class="lucide lucide-chevron-right inline w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/></svg>`;
              toggle.setAttribute('data-state', 'closed');
            }
            this.toggleChildren(row.id, false);
          }
        });
      }

      /**
       * Filtering logic for the grid. Should be implemented in subclasses.
       */
      applyTableFilters() {
        // To be implemented in derived class
      }
    }