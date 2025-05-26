// Button-Flags
    const MBOK = 1;       // 0b001
    const MBYESNO = 2;    // 0b010
    const MBCANCEL = 4;   // 0b100
    const NOBUTTON = 0;   // 0b000

    /**
     * Klasse für modale Fenster mit Tailwind CSS im NGUI-Framework.
     */
    class NGUIModal {
        /**
         * Erstellt ein modales Fenster mit Tailwind-Styling.
         * @param {string} title - Titel des Fensters.
         * @param {string} text - Inhaltstext des Fensters.
         * @param {number} buttons - Bitmaske für Buttons (z.B. MBOK | MBYESNO).
         * @param {string} [modalClass='bg-gray-700'] - Tailwind-Klasse für Modal-Farbe.
         * @param {boolean} [showInput=false] - Ob ein Eingabefeld angezeigt werden soll.
         * @param {string} [inputLabel=''] - Label über dem Eingabefeld.
         * @param {string} [inputPlaceholder=''] - Platzhalter im Eingabefeld.
         */
        constructor(title, text, buttons, modalClass = 'bg-gray-700', showInput = false, inputLabel = '', inputPlaceholder = '') {
            this.title = title || 'Modal';
            this.text = text || '';
            this.buttons = buttons;
            this.modalClass = modalClass;
            this.result = null;
            this.modalElement = null;
            this.resolvePromise = null;

            // Neue Optionen
            this.showInput = showInput;
            this.inputLabel = inputLabel;
            this.inputPlaceholder = inputPlaceholder;
            this.inputValue = '';

            this.createModal();
        }

        /**
         * Erstellt das DOM-Element für das modale Fenster mit Tailwind-Klassen.
         */
        createModal() {
            // Erstelle Modal
            this.modalElement = document.createElement('div');
            this.modalElement.className = `fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 transition-all duration-150`;
            this.modalElement.setAttribute('tabindex', '-1');
            this.modalElement.setAttribute('role', 'dialog');

            // Modal-Dialog
            const dialog = document.createElement('div');
            dialog.className = 'bg-white rounded-lg shadow-sm max-w-sm w-full mx-4 border border-gray-300 hover:shadow-md transition-shadow duration-150';

            // Modal-Content
            const content = document.createElement('div');
            content.className = 'flex flex-col';

            // Header
            const header = document.createElement('div');
            header.className = `flex justify-between items-center p-1 ${this.modalClass} text-white rounded-t-lg h-6`;
            const titleElement = document.createElement('h5');
            titleElement.className = 'text-xs font-medium text-white truncate';
            titleElement.textContent = this.title;
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'text-white hover:text-gray-200 focus:outline-none w-5 h-5 flex items-center justify-center hover:rotate-90 transition-transform duration-150';
            closeButton.setAttribute('aria-label', 'Close');
            closeButton.innerHTML = '<i class="fas fa-times text-[10px] text-white"></i>'; // Weißes Icon
            closeButton.addEventListener('click', () => {
                this.result = 'cancel';
                this.Close();
                if (this.resolvePromise) this.resolvePromise(this.result);
            });
            header.appendChild(titleElement);
            header.appendChild(closeButton);

            // Body
            const body = document.createElement('div');
            body.className = 'p-2 bg-gray-50';
            const textElement = document.createElement('p');
            textElement.className = 'text-gray-600 text-xs';
            textElement.textContent = this.text;
            body.appendChild(textElement);

            if (this.showInput) {
                const label = document.createElement('label');
                label.textContent = this.inputLabel || 'Bitte Eingabe:';
                label.className = 'block text-[10px] font-medium text-gray-600 mt-1';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'mt-1 block w-full border border-gray-200 rounded-md shadow-sm p-1 text-xs focus:ring-1 focus:ring-gray-500 focus:border-gray-500';
                input.placeholder = this.inputPlaceholder || '';
                input.addEventListener('input', (e) => {
                    this.inputValue = e.target.value;
                });

                body.appendChild(label);
                body.appendChild(input);
            }

            // Footer
            const footer = document.createElement('div');
            footer.className = 'flex justify-end p-2 space-x-1 border-t border-gray-200 rounded-b-lg';

            // Füge Buttons basierend auf Flags hinzu
            if (this.buttons & MBOK) {
                this.addButton(footer, 'OK', 'ok', 'bg-gray-700 hover:bg-gray-800 hover:scale-105 text-white');
            }
            if (this.buttons & MBYESNO) {
                this.addButton(footer, 'Yes', 'yes', 'bg-green-600 hover:bg-green-700 hover:scale-105 text-white');
                this.addButton(footer, 'No', 'no', 'bg-red-600 hover:bg-red-700 hover:scale-105 text-white');
            }
            if (this.buttons & MBCANCEL) {
                this.addButton(footer, 'Cancel', 'cancel', 'bg-gray-500 hover:bg-gray-600 hover:scale-105 text-white');
            }

            // Baue Modal zusammen
            content.appendChild(header);
            content.appendChild(body);
            content.appendChild(footer);
            dialog.appendChild(content);
            this.modalElement.appendChild(dialog);
        }

        /**
         * Fügt einen Button zum Footer hinzu.
         * @param {HTMLElement} container - Footer-Container.
         * @param {string} label - Button-Text.
         * @param {string} result - Ergebniswert beim Klick.
         * @param {string} btnClass - Tailwind Button-Klassen.
         */
        addButton(container, label, result, btnClass) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `px-2.5 py-1 rounded-md text-xs font-medium focus:outline-none focus:ring-1 focus:ring-offset-1 transition-all duration-150 ${btnClass}`;
            button.textContent = label;
            button.addEventListener('click', () => {
                this.result = this.showInput ? { action: result, value: this.inputValue } : result;
                this.Close();
                if (this.resolvePromise) this.resolvePromise(this.result);
            });
            container.appendChild(button);
        }

        /**
         * Zeigt das modale Fenster an.
         */
        Show() {
            if (this.modalElement) {
                document.body.appendChild(this.modalElement);
                this.modalElement.classList.add('opacity-100');
                setTimeout(() => {
                    const firstButton = this.modalElement.querySelector('button:not([aria-label="Close"])');
                    if (firstButton) firstButton.focus();
                }, 0);
            }
        }

        /**
         * Zeigt das modale Fenster an und gibt ein Promise zurück.
         * @returns {Promise<string|{action: string, value: string}|null>}
         */
        ShowAsync() {
            return new Promise((resolve) => {
                this.resolvePromise = resolve;
                this.Show();
            });
        }

        /**
         * Schließt das modale Fenster und gibt das Ergebnis zurück.
         * @returns {string|null}
         */
        Close() {
            if (this.modalElement) {
                this.modalElement.classList.remove('opacity-100');
                this.modalElement.classList.add('opacity-0');
                setTimeout(() => {
                    if (this.modalElement.parentNode) {
                        this.modalElement.parentNode.removeChild(this.modalElement);
                    }
                }, 150); // Angepasst an die neue Transition-Dauer
            }
            return this.result;
        }
    }

    // Export für Module
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = { NGUIModal, MBOK, MBYESNO, MBCANCEL };
    }