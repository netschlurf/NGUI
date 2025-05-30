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
 * Klasse für ein fensterartiges Overlay im AdminLTE-Stil.
 */
class NGUIWindow {
    /**
     * Statische Liste für minimierte Fenster pro Parent.
     * @type {Map<string, {id: string, index: number}[]>}
     */
    static minimizedWindows = new Map();

    /**
     * Statischer z-Index-Zähler.
     * @type {number}
     */
    static maxZIndex = 1050;

    /**
     * Erstellt ein neues Fenster.
     * @param {string} windowId - Eindeutige ID des Fensters.
     * @param {string} title - Titel des Fensters.
     * @param {number} buttons - Bitmaske für Buttons (WB_MINIMIZE | WB_MAXIMIZE | WB_CLOSE).
     * @param {HTMLElement|null} [parent=null] - Eltern-Div, in dem das Fenster bewegt wird.
     * @returns {NGUIWindow} Instanz des Fensters.
     */
    static Create(windowId, title, buttons, parent = null) {
        if (windowId && document.getElementById(windowId)) {
            throw new Error(`Fenster mit ID ${windowId} existiert bereits.`);
        }
        return new NGUIWindow(windowId, title, buttons, parent);
    }

    /**
     * Konstruktor für ein fensterartiges Overlay.
     * @param {string} windowId - Eindeutige ID des Fensters.
     * @param {string} title - Titel des Fensters.
     * @param {number} buttons - Bitmaske für Buttons (WB_MINIMIZE | WB_MAXIMIZE | WB_CLOSE).
     * @param {HTMLElement|null} [parent=null] - Eltern-Div, in dem das Fenster bewegt wird.
     */
    constructor(windowId, title, buttons, parent = null) {
        this.windowId = windowId || `window_${generateUUID()}`;
        if (document.getElementById(this.windowId)) {
            throw new Error(`Fenster mit ID ${this.windowId} existiert bereits.`);
        }
        this.title = title || 'Window';
        this.buttons = buttons || WB_NONE;
        this.parent = parent || document.body;
        this.state = 'normal'; // normal, minimized, maximized
        this.result = null;
        this.windowElement = null;
        this.resolvePromise = null;

        // Größen- und Positionsstatus
        this.normalSize = { width: 600, height: 400 };
        this.normalPosition = { x: 100, y: 100 };
        this.minimizedSize = { width: 200, height: 30 };
        this.previousSize = { ...this.normalSize };
        this.previousPosition = { ...this.normalPosition };

        // Event-Listener für Dragging
        this.dragListeners = { mousemove: null, mouseup: null };

        // Initialisiere minimierte Fenster für diesen Parent
        const parentId = this.parent === document.body ? 'body' : this.parent.id || generateUUID();
        if (!NGUIWindow.minimizedWindows.has(parentId)) {
            NGUIWindow.minimizedWindows.set(parentId, []);
        }

        this.parentId = parentId;
        this.createWindow();
    }

    /**
     * Erstellt das DOM-Element für das Fenster.
     */
    createWindow() {
        this.windowElement = document.createElement('div');
        this.windowElement.id = this.windowId;
        this.windowElement.className = 'ngui-window card card-secondary';
        this.windowElement.style.position = 'absolute'; // Relativ zum Parent
        this.windowElement.style.zIndex = NGUIWindow.maxZIndex++;
        this.windowElement.style.width = `${this.normalSize.width}px`;
        this.windowElement.style.height = `${this.normalSize.height}px`;
        this.windowElement.style.left = `${this.normalPosition.x}px`;
        this.windowElement.style.top = `${this.normalPosition.y}px`;
        this.windowElement.style.resize = 'both';
        this.windowElement.style.overflow = 'auto';
        this.windowElement.style.minWidth = '200px';
        this.windowElement.style.minHeight = '100px';

        // Titlebar
        const titlebar = document.createElement('div');
        titlebar.className = 'card-header ngui-window-titlebar';
        titlebar.style.cursor = 'move';
        titlebar.style.background = 'linear-gradient(135deg, #6b7280, #4b5563)';
        titlebar.style.color = 'white';
        titlebar.style.userSelect = 'none';

        const titleElement = document.createElement('h5');
        titleElement.className = 'card-title';
        titleElement.textContent = this.title;
        titlebar.appendChild(titleElement);

        // Titlebar-Buttons
        const tools = document.createElement('div');
        tools.className = 'card-tools';

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

        // Content
        const content = document.createElement('div');
        content.className = 'card-body';
        content.style.background = '#f8f9fa';
        content.style.height = 'calc(100% - 50px)';
        content.style.padding = '1rem';

        const contentDiv = document.createElement('div');
        contentDiv.id = `${this.windowId}_CONTENT`;
        content.appendChild(contentDiv);

        // Baue Fenster zusammen
        this.windowElement.appendChild(titlebar);
        this.windowElement.appendChild(content);

        // Mache das Fenster draggable
        this.makeDraggable(titlebar);

        // Mache das Fenster resizable
        this.windowElement.addEventListener('resize', () => {
            if (this.state === 'normal') {
                this.normalSize.width = this.windowElement.offsetWidth;
                this.normalSize.height = this.windowElement.offsetHeight;
            }
        });
    }

    /**
     * Fügt einen Button zur Titlebar hinzu.
     * @param {HTMLElement} container - Card-tools Container.
     * @param {string} iconClass - Font Awesome Icon-Klasse.
     * @param {string} title - Tooltip-Text.
     * @param {Function} onClick - Click-Handler.
     * @returns {HTMLElement} Ersteller Button.
     */
addTitlebarButton(container, iconClass, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'p-0.5 text-white hover:text-gray-200 focus:outline-none w-5 h-5 flex items-center justify-center';
    button.title = title;
    // SVG statt <i>
    let svg = '';
    if (iconClass.includes('fa-minus')) {
        svg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="6" x2="10" y2="6"/></svg>`;
    } else if (iconClass.includes('fa-expand')) {
        svg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="8" height="8"/></svg>`;
    } else if (iconClass.includes('fa-compress')) {
        svg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/></svg>`;
    } else if (iconClass.includes('fa-plus')) {
        svg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>`;
    } else if (iconClass.includes('fa-times')) {
        svg = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>`;
    }
    button.innerHTML = svg;
    button.style.display = 'inline-flex';
    button.addEventListener('click', onClick);
    container.appendChild(button);
    return button;
}

    /**
     * Macht das Fenster draggable mit Andocken an Parent-Ränder.
     * @param {HTMLElement} titlebar - Titlebar-Element.
     */
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
                titlebar.style.cursor = 'grabbing';
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

                // Begrenze die Bewegung innerhalb des Parent
                newX = Math.max(0, Math.min(newX, parentRect.width - windowWidth));
                newY = Math.max(0, Math.min(newY, parentRect.height - windowHeight));

                // Snapping an Ränder (innerhalb von 10px)
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
            titlebar.style.cursor = 'move';
        };

        titlebar.addEventListener('mousedown', mousedownHandler);
        document.addEventListener('mousemove', this.dragListeners.mousemove);
        document.addEventListener('mouseup', this.dragListeners.mouseup);
    }

    /**
     * Toggelt zwischen minimiertem und normalem Zustand.
     */
    toggleMinimize() {
        if (this.state === 'minimized') {
            this.restore();
        } else {
            this.minimize();
        }
    }

    /**
     * Minimiert das Fenster als Reiter unten links im Parent.
     */
    minimize() {
        if (this.state !== 'minimized') {
            this.previousSize = { ...this.normalSize };
            this.previousPosition = { ...this.normalPosition };
            this.state = 'minimized';

            // Registriere das Fenster in der Liste der minimierten Fenster
            const minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
            const index = minimizedList.length;
            minimizedList.push({ id: this.windowId, index });
            NGUIWindow.minimizedWindows.set(this.parentId, minimizedList);

            // Positioniere als Reiter unten links
            this.windowElement.style.width = `${this.minimizedSize.width}px`;
            this.windowElement.style.height = `${this.minimizedSize.height}px`;
            this.windowElement.style.left = '0';
            this.windowElement.style.bottom = `${index * 35}px`; // Stapeln nach oben
            this.windowElement.style.top = 'auto';
            this.windowElement.style.resize = 'none';
            this.windowElement.querySelector('.card-body').style.display = 'none';

            // Verstecke alle Buttons außer Minimize (Wiederherstellen)
            const tools = this.windowElement.querySelector('.card-tools');
            tools.innerHTML = '';
            if (this.buttons & WB_MINIMIZE) {
                this.minimizeButton = this.addTitlebarButton(tools, 'fas fa-plus', 'Wiederherstellen', () => this.toggleMinimize());
            }

            // Aktualisiere den Titel
            const titleElement = this.windowElement.querySelector('.card-title');
            titleElement.style.fontSize = '14px'; // Kleinere Schrift für Reiter
        }
    }

    /**
     * Toggelt zwischen maximiertem und normalem Zustand.
     */
    toggleMaximize() {
        if (this.state === 'maximized') {
            this.restore();
        } else {
            this.maximize();
        }
    }

    /**
     * Maximiert das Fenster innerhalb des Parent.
     */
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
        this.windowElement.querySelector('.card-body').style.display = 'block';

        if (this.maximizeButton) {
            this.maximizeButton.querySelector('i').className = 'fas fa-compress';
            this.maximizeButton.title = 'Wiederherstellen';
        }
    }

    /**
     * Stellt das Fenster auf den normalen Zustand zurück.
     */
    restore() {
        this.state = 'normal';

        // Entferne aus minimierten Fenstern
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
        this.windowElement.querySelector('.card-body').style.display = 'block';

        // Stelle die Titlebar-Buttons wieder her
        const tools = this.windowElement.querySelector('.card-tools');
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

        // Stelle die Titelgröße zurück
        const titleElement = this.windowElement.querySelector('.card-title');
        titleElement.style.fontSize = '';
    }

    /**
     * Aktualisiert die Positionen aller minimierten Fenster im Parent.
     */
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

    /**
     * Zeigt das Fenster an.
     */
    Show() {
        if (this.windowElement) {
            this.parent.appendChild(this.windowElement);
            this.windowElement.style.zIndex = NGUIWindow.maxZIndex++;
            this.windowElement.focus();
        }
    }

    /**
     * Zeigt das Fenster an und gibt ein Promise zurück.
     * @returns {Promise<string|null>} Ergebnis des Fensters (z.B. 'close').
     */
    ShowAsync() {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.Show();
        });
    }

    /**
     * Schließt das Fenster und gibt das Ergebnis zurück.
     * @returns {string|null}
     */
    Close() {
        if (this.windowElement && this.windowElement.parentNode) {
            // Entferne Event-Listener
            if (this.dragListeners.mousemove) {
                document.removeEventListener('mousemove', this.dragListeners.mousemove);
            }
            if (this.dragListeners.mouseup) {
                document.removeEventListener('mouseup', this.dragListeners.mouseup);
            }

            // Entferne aus minimierten Fenstern
            let minimizedList = NGUIWindow.minimizedWindows.get(this.parentId) || [];
            minimizedList = minimizedList.filter(w => w.id !== this.windowId);
            NGUIWindow.minimizedWindows.set(this.parentId, minimizedList);
            this.updateMinimizedPositions();

            // Entferne aus DOM
            this.windowElement.parentNode.removeChild(this.windowElement);
            this.windowElement = null;
        }
        return this.result;
    }
}

// Export für Module
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { NGUIWindow, WB_MINIMIZE, WB_MAXIMIZE, WB_CLOSE, WB_NONE };
}