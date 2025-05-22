   // Button-Flags
   const WB_MINIMIZE = 1;  // 0b001
   const WB_MAXIMIZE = 2;  // 0b010
   const WB_CLOSE = 4;     // 0b100
   const WB_NONE = 0;      // 0b000

   // Einfache UUID-Generierung für eindeutige IDs
   function generateUUID() {
       return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
           const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
           return v.toString(16);
       });
   }

   /**
    * Klasse für ein fensterartiges Overlay mit Tailwind CSS.
    */
   class NGUIWindow {
       static minimizedWindows = new Map();
       static maxZIndex = 1050;

       static Create(windowId, title, buttons, parent = null) {
           if (windowId && document.getElementById(windowId)) {
               throw new Error(`Fenster mit ID ${windowId} existiert bereits.`);
           }
           return new NGUIWindow(windowId, title, buttons, parent);
       }

       constructor(windowId, title, buttons, parent = null) {
           this.windowId = windowId || `window_${generateUUID()}`;
           if (document.getElementById(this.windowId)) {
               throw new Error(`Fenster mit ID ${this.windowId} existiert bereits.`);
           }
           this.title = title || 'Window';
           this.buttons = buttons || WB_NONE;
           this.parent = parent || document.body;
           this.state = 'normal';
           this.result = null;
           this.windowElement = null;
           this.resolvePromise = null;
           this.normalSize = { width: 600, height: 400 };
           this.normalPosition = { x: 100, y: 100 };
           this.minimizedSize = { width: 200, height: 30 };
           this.previousSize = { ...this.normalSize };
           this.previousPosition = { ...this.normalPosition };
           this.dragListeners = { mousemove: null, mouseup: null };
           const parentId = this.parent === document.body ? 'body' : this.parent.id || generateUUID();
           if (!NGUIWindow.minimizedWindows.has(parentId)) {
               NGUIWindow.minimizedWindows.set(parentId, []);
           }
           this.parentId = parentId;
           this.createWindow();
       }

       createWindow() {
           this.windowElement = document.createElement('div');
           this.windowElement.id = this.windowId;
           this.windowElement.className = 'bg-white rounded-lg shadow-xl opacity-90 hover:opacity-100 focus-within:opacity-100 border border-gray-200 transition-opacity duration-200';
           this.windowElement.style.position = 'absolute';
           this.windowElement.style.zIndex = NGUIWindow.maxZIndex++;
           this.windowElement.style.width = `${this.normalSize.width}px`;
           this.windowElement.style.height = `${this.normalSize.height}px`;
           this.windowElement.style.left = `${this.normalPosition.x}px`;
           this.windowElement.style.top = `${this.normalPosition.y}px`;
           this.windowElement.style.resize = 'both';
           this.windowElement.style.overflow = 'auto';
           this.windowElement.style.minWidth = '200px';
           this.windowElement.style.minHeight = '100px';

           const titlebar = document.createElement('div');
           titlebar.className = 'flex items-center p-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-t-lg cursor-move select-none h-8';
           const titleElement = document.createElement('h5');
           titleElement.className = 'text-sm font-semibold flex-grow';
           titleElement.textContent = this.title;
           titlebar.appendChild(titleElement);

           const tools = document.createElement('div');
           tools.className = 'flex space-x-1';

           if (this.buttons & WB_MINIMIZE) {
               this.minimizeButton = this.addTitlebarButton(tools, 'fas fa-minus', 'Minimieren', () => this.toggleMinimize());
           }
           if (this.buttons & WB_MAXIMIZE) {
               this.maximizeButton = this.addTitlebarButton(tools, 'fas fa-expand', 'Maximieren', () => this.toggleMaximize());
           }
           if (this.buttons & WB_CLOSE) {
               this.addTitlebarButton(tools, 'fas fa-times', 'Schließen', () => {
                   this.result = 'close';
                   this.Close();
                   if (this.resolvePromise) this.resolvePromise(this.result);
               });
           }

           titlebar.appendChild(tools);

           const content = document.createElement('div');
           content.className = 'p-4 bg-gray-50 h-[calc(100%-32px)]';
           const contentDiv = document.createElement('div');
           contentDiv.id = `${this.windowId}_CONTENT`;
           content.appendChild(contentDiv);

           this.windowElement.appendChild(titlebar);
           this.windowElement.appendChild(content);

           this.makeDraggable(titlebar);

           this.windowElement.addEventListener('resize', () => {
               if (this.state === 'normal') {
                   this.normalSize.width = this.windowElement.offsetWidth;
                   this.normalSize.height = this.windowElement.offsetHeight;
               }
           });
       }

       addTitlebarButton(container, iconClass, title, onClick) {
           const button = document.createElement('button');
           button.type = 'button';
           button.className = 'p-0.5 text-white hover:text-gray-200 focus:outline-none w-6 h-6 flex items-center justify-center';
           button.title = title;
           button.innerHTML = `<i class="${iconClass} text-xs"></i>`;
           button.addEventListener('click', onClick);
           container.appendChild(button);
           return button;
       }

       makeDraggable(titlebar) {
           let isDragging = false;
           let currentX = this.normalPosition.x;
           let currentY = this.normalPosition.y;
           let initialX, initialY;

           const mousedownHandler = (e) => {
               if (this.state !== 'maximized' && this.state !== 'minimized') {
                   initialX = e.clientX - currentX;
                   initialY = e.clientY - currentY;
                   isDragging = true;
                   titlebar.classList.add('cursor-grabbing');
               }
           };

           this.dragListeners.mousemove = (e) => {
               if (isDragging) {
                   e.preventDefault();
                   const parentRect = this.parent === document.body
                       ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
                       : this.parent.getBoundingClientRect();

                   const windowWidth = this.windowElement.offsetWidth;
                   const windowHeight = this.windowElement.offsetHeight;

                   let newX = e.clientX - initialX;
                   let newY = e.clientY - initialY;

                   newX = Math.max(0, Math.min(newX, parentRect.width - windowWidth));
                   newY = Math.max(0, Math.min(newY, parentRect.height - windowHeight));

                   const snapThreshold = 10;
                   if (newX < snapThreshold) newX = 0;
                   if (newY < snapThreshold) newY = 0;
                   if (parentRect.width - newX - windowWidth < snapThreshold) newX = parentRect.width - windowWidth;
                   if (parentRect.height - newY - windowHeight < snapThreshold) newY = parentRect.height - windowHeight;

                   currentX = newX;
                   currentY = newY;
                   this.normalPosition.x = currentX;
                   this.normalPosition.y = currentY;

                   this.windowElement.style.left = `${currentX}px`;
                   this.windowElement.style.top = `${currentY}px`;
               }
           };

           this.dragListeners.mouseup = () => {
               isDragging = false;
               titlebar.classList.remove('cursor-grabbing');
               titlebar.classList.add('cursor-move');
           };

           titlebar.addEventListener('mousedown', mousedownHandler);
           document.addEventListener('mousemove', this.dragListeners.mousemove);
           document.addEventListener('mouseup', this.dragListeners.mouseup);
       }

       toggleMinimize() {
           if (this.state === 'minimized') {
               this.restore();
           } else {
               this.minimize();
           }
       }

       minimize() {
           if (this.state !== 'minimized') {
               this.previousSize = { ...this.normalSize };
               this.previousPosition = { ...this.normalPosition };
               this.state = 'minimized';

               const minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
               const index = minimizedList.length;
               minimizedList.push({ id: this.windowId, index });
               NGUIWindow.minimizedWindows.set(this.parentId, minimizedList);

               this.windowElement.style.width = `${this.minimizedSize.width}px`;
               this.windowElement.style.height = `${this.minimizedSize.height}px`;
               this.windowElement.style.left = '0';
               this.windowElement.style.bottom = `${index * 35}px`;
               this.windowElement.style.top = 'auto';
               this.windowElement.style.resize = 'none';
               this.windowElement.querySelector('.p-4').style.display = 'none';

               const tools = this.windowElement.querySelector('.flex.space-x-1');
               tools.innerHTML = '';
               if (this.buttons & WB_MINIMIZE) {
                   this.minimizeButton = this.addTitlebarButton(tools, 'fas fa-plus', 'Wiederherstellen', () => this.toggleMinimize());
               }

               const titleElement = this.windowElement.querySelector('.text-sm') || this.windowElement.querySelector('.text-xs');
               titleElement.className = 'text-xs font-semibold flex-grow';
           }
       }

       toggleMaximize() {
           if (this.state === 'maximized') {
               this.restore();
           } else {
               this.maximize();
           }
       }

       maximize() {
           this.previousSize = { ...this.normalSize };
           this.previousPosition = { ...this.normalPosition };
           this.state = 'maximized';

           const parentRect = this.parent === document.body
               ? { width: window.innerWidth, height: window.innerHeight }
               : this.parent.getBoundingClientRect();

           this.windowElement.style.width = `${parentRect.width}px`;
           this.windowElement.style.height = `${parentRect.height}px`;
           this.windowElement.style.left = '0';
           this.windowElement.style.top = '0';
           this.windowElement.style.bottom = 'auto';
           this.windowElement.style.resize = 'none';
           this.windowElement.querySelector('.p-4').style.display = 'block';

           if (this.maximizeButton) {
               this.maximizeButton.querySelector('i').className = 'fas fa-compress text-xs';
               this.maximizeButton.title = 'Wiederherstellen';
           }
       }

       restore() {
           this.state = 'normal';

           let minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
           minimizedList = minimizedList.filter(w => w.id !== this.windowId);
           NGUIWindow.minimizedWindows.set(this.parentId, minimizedList);
           this.updateMinimizedPositions();

           this.windowElement.style.width = `${this.previousSize.width}px`;
           this.windowElement.style.height = `${this.previousSize.height}px`;
           this.windowElement.style.left = `${this.previousPosition.x}px`;
           this.windowElement.style.top = `${this.previousPosition.y}px`;
           this.windowElement.style.bottom = 'auto';
           this.windowElement.style.resize = 'both';
           this.windowElement.querySelector('.p-4').style.display = 'block';

           const tools = this.windowElement.querySelector('.flex.space-x-1');
           tools.innerHTML = '';
           if (this.buttons & WB_MINIMIZE) {
               this.minimizeButton = this.addTitlebarButton(tools, 'fas fa-minus', 'Minimieren', () => this.toggleMinimize());
           }
           if (this.buttons & WB_MAXIMIZE) {
               this.maximizeButton = this.addTitlebarButton(tools, 'fas fa-expand', 'Maximieren', () => this.toggleMaximize());
           }
           if (this.buttons & WB_CLOSE) {
               this.addTitlebarButton(tools, 'fas fa-times', 'Schließen', () => {
                   this.result = 'close';
                   this.Close();
                   if (this.resolvePromise) this.resolvePromise(this.result);
               });
           }

           const titleElement = this.windowElement.querySelector('.text-xs') || this.windowElement.querySelector('.text-sm');
           titleElement.className = 'text-sm font-semibold flex-grow';
       }

       updateMinimizedPositions() {
           const minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
           minimizedList.forEach((win, index) => {
               const element = document.getElementById(win.id);
               if (element) {
                   element.style.left = '0';
                   element.style.bottom = `${index * 35}px`;
               }
               win.index = index;
           });
       }

       Show() {
           if (this.windowElement) {
               this.parent.appendChild(this.windowElement);
               this.windowElement.style.zIndex = NGUIWindow.maxZIndex++;
               this.windowElement.focus();
           }
       }

       ShowAsync() {
           return new Promise((resolve) => {
               this.resolvePromise = resolve;
               this.Show();
           });
       }

       Close() {
           if (this.windowElement && this.windowElement.parentNode) {
               if (this.dragListeners.mousemove) {
                   document.removeEventListener('mousemove', this.dragListeners.mousemove);
               }
               if (this.dragListeners.mouseup) {
                   document.removeEventListener('mouseup', this.dragListeners.mouseup);
               }

               let minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
               minimizedList = minimizedList.filter(w => w.id !== this.windowId);
               NGUIWindow.minimizedWindows.set(this.parentId, minimizedList);
               this.updateMinimizedPositions();

               this.windowElement.parentNode.removeChild(this.windowElement);
               this.windowElement = null;
           }
           return this.result;
       }
   }