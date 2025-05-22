// Button-Flags
const MBOK = 1;       // 0b001
const MBYESNO = 2;    // 0b010
const MBCANCEL = 4;   // 0b100
const NOBUTTON = 0;   // 0b000

/**
 * Klasse für AdminLTE-Modale im NGUI-Framework.
 */
class NGUIModal {
    /**
     * Erstellt ein modales Fenster im AdminLTE-Stil.
     * @param {string} title - Titel des Fensters.
     * @param {string} text - Inhaltstext des Fensters.
     * @param {number} buttons - Bitmaske für Buttons (z.B. MBOK | MBYESNO).
     * @param {string} [modalClass='modal-primary'] - AdminLTE-Modal-Klasse (z.B. 'modal-primary', 'modal-danger').
     * @param {boolean} [showInput=false] - Ob ein Eingabefeld angezeigt werden soll.
     * @param {string} [inputLabel=''] - Label über dem Eingabefeld.
     * @param {string} [inputPlaceholder=''] - Platzhalter im Eingabefeld.
     */
    constructor(title, text, buttons, modalClass = 'modal-primary', showInput = false, inputLabel = '', inputPlaceholder = '') {
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
     * Erstellt das DOM-Element für das modale Fenster.
     */
    createModal() {
        // Erstelle Modal
        this.modalElement = document.createElement('div');
        this.modalElement.className = `modal fade ${this.modalClass}`;
        this.modalElement.setAttribute('tabindex', '-1');
        this.modalElement.setAttribute('role', 'dialog');

        // Modal-Dialog
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';
        dialog.setAttribute('role', 'document');

        // Modal-Content
        const content = document.createElement('div');
        content.className = 'modal-content';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const titleElement = document.createElement('h5');
        titleElement.className = 'modal-title';
        titleElement.textContent = this.title;
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'close';
        closeButton.setAttribute('data-dismiss', 'modal');
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.innerHTML = '<span aria-hidden="true">&times;</span>';
        closeButton.addEventListener('click', () => {
            this.result = 'cancel';
            this.Close();
            if (this.resolvePromise) this.resolvePromise(this.result);
        });
        header.appendChild(titleElement);
        header.appendChild(closeButton);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        const textElement = document.createElement('p');
        textElement.textContent = this.text;
        body.appendChild(textElement);

        if (this.showInput) {
            const label = document.createElement('label');
            label.textContent = this.inputLabel || 'Bitte Eingabe:';
            label.className = 'form-label';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            input.placeholder = this.inputPlaceholder || '';
            input.addEventListener('input', (e) => {
                this.inputValue = e.target.value;
            });

            body.appendChild(label);
            body.appendChild(input);
        }

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        // Füge Buttons basierend auf Flags hinzu
        if (this.buttons & MBOK) {
            this.addButton(footer, 'OK', 'ok', 'btn-primary');
        }
        if (this.buttons & MBYESNO) {
            this.addButton(footer, 'Yes', 'yes', 'btn-success');
            this.addButton(footer, 'No', 'no', 'btn-danger');
        }
        if (this.buttons & MBCANCEL) {
            this.addButton(footer, 'Cancel', 'cancel', 'btn-secondary');
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
     * @param {string} btnClass - Bootstrap/AdminLTE Button-Klasse.
     */
    addButton(container, label, result, btnClass) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${btnClass}`;
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
            $(this.modalElement).modal({
                backdrop: 'static',
                keyboard: true
            });
            $(this.modalElement).on('shown.bs.modal', () => {
                const firstButton = this.modalElement.querySelector('.btn');
                if (firstButton) firstButton.focus();
            });
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
            $(this.modalElement).modal('hide');
            if (this.modalElement.parentNode) {
                this.modalElement.parentNode.removeChild(this.modalElement);
            }
        }
        return this.result;
    }
}

// Export für Module
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { NGUIModal, MBOK, MBYESNO, MBCANCEL };
}
