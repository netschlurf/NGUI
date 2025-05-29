class NGUI_Splitter {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) {
      throw new Error("Container nicht gefunden: " + containerSelector);
    }
    this.splitters = {};
  }

  enableVerticalSplitter(splitterSelector, options = {}) {
    const splitter = document.querySelector(splitterSelector);
    if (!splitter) {
      throw new Error("Vertikaler Splitter nicht gefunden: " + splitterSelector);
    }

    let isResizing = false;
    const minWidth = options.minWidth || 150;
    const maxWidth = options.maxWidth || window.innerWidth - 150;

    splitter.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
    });

    window.addEventListener("mouseup", () => {
      isResizing = false;
      document.body.style.cursor = "default";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      let newWidth = e.clientX;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      this.container.style.gridTemplateColumns = `${newWidth}px 5px 1fr`;
    });

    this.splitters.vertical = splitter;
  }

  enableHorizontalSplitter(splitterSelector, options = {}) {
    const splitter = document.querySelector(splitterSelector);
    if (!splitter) {
      throw new Error("Horizontaler Splitter nicht gefunden: " + splitterSelector);
    }

    let isResizing = false;
    const minHeight = options.minHeight || 100;
    const maxHeightOffset = options.maxHeightOffset || 150;

    splitter.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.cursor = "row-resize";
    });

    window.addEventListener("mouseup", () => {
      isResizing = false;
      document.body.style.cursor = "default";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const containerRect = this.container.getBoundingClientRect();
      const top = containerRect.top;
      const height = containerRect.height;
      let newHeight = e.clientY;

      const maxHeight = top + height - maxHeightOffset;
      newHeight = Math.max(top + minHeight, Math.min(maxHeight, newHeight));

      const topRowHeight = newHeight - top;
      const bottomRowHeight = height - topRowHeight - 5;

      this.container.style.gridTemplateRows = `${topRowHeight}px 5px ${bottomRowHeight}px`;
    });

    this.splitters.horizontal = splitter;
  }
}
