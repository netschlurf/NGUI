class NGUICB {
    constructor() {
        this.tok = 0;
        this.callback = null;
        this.persistent = false; // If false, the callback will be removed after execution
    }
}

class NGUIMsg {
    static msgCounter = 0;

    constructor() {
        this.tok = NGUIMsg.msgCounter++;
        this.cmd = "";
        this.args = new Object();
    }
}

class NGUIConnection {
    constructor(ui) {
        this.Connection = null;
        this.UI = ui;
        this.callBacks = new Array();
    }

    Log(msg, inLvl) {
        const lvl = 10;
        if (lvl >= inLvl)
            console.log(msg);
    }

    LoadPage(fileName, target, params, callback) {
        var msg = new NGUIMsg();
        msg.cmd = "LoadPage";
        msg.args.fileName = fileName;
        msg.args.params = params;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        cb.target = target;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }

    LoadResource(fileName, params, callback) {
        var msg = new NGUIMsg();
        msg.cmd = "LoadResource";
        msg.args.fileName = fileName;
        msg.args.params = params;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }

    SendData(obj, target, callback) {
        var msg = new NGUIMsg();
        msg.cmd = "SendData";
        msg.args.data = obj;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        this.Connection.send(JSON.stringify(msg));
    }

    SendCustomCommand(command, args, callback, callbackPersistent = false) {
        var msg = new NGUIMsg();
        msg.cmd = command;
        msg.args = args;
        var cb = new NGUICB();
        cb.persistent = callbackPersistent;
        cb.tok = msg.tok;
        cb.callback = callback;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }

    Log(str, lvl) {
        if (lvl > 10)
            console.log(str);
    }


    Connect(url, callback) {
        this.Connection = new WebSocket(url, "protocolOne");
        this.Connection.onopen = function (event) {
            this.Log("onopen", 10);
            if (this.UI)
                this.UI.OnOpen(event);
        }.bind(this);

        this.Connection.onerror = function (event) {
            this.Log("onerror", 9);
            if (this.UI)
                this.UI.OnError(event);
        }.bind(this);

        this.Connection.onclose = function (event) {
            this.Log("onclose!", 10);
            if (this.UI)
                this.UI.OnClose(event);
        }.bind(this);

        this.Connection.onmessage = function (event) {
            this.Log("onmessage!", 10);
            try {
                var rcv = JSON.parse(event.data);
                for (var i = 0; i < this.callBacks.length; i++) {
                    if (rcv.tok == this.callBacks[i].tok) {
                        rcv.target = this.callBacks[i].target;
                        this.callBacks[i].callback(rcv);
                        if (!this.callBacks[i].persistent) {
                            this.callBacks.splice(i, 1);
                        }
                        break;
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        }.bind(this);
    }
}

class NGUIClient {
    constructor() {
        this.Connection = null;
        this.DbClient = null;
        this.dpGetElements = new Array();
        this.dpConnectElements = new Array();
    }

    GetDbClient() {
        if (this.DbClient === null)
            this.DbClient = new IME_DBClient(this.Connection);
        return this.DbClient;
    }

    Connect(url, onOpen) {
        this.CbOnOpen = onOpen;
        this.Connection = new NGUIConnection(this);
        this.Connection.Connect(url);
    }

    LoadPage(fileName, target, params) {
        this.Connection.LoadPage(fileName, target, params, this.OnMessage.bind(this));
    }

    LoadResource(fileName, params, callback) {
        this.Connection.LoadResource(fileName, params, callback);
    }

    LoadPageAJAX(fileName, target) {
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function () {
            if (xhttp.readyState == 4 && xhttp.status == 200) {
                if (window["OnPageUnload"] !== undefined)
                    window["OnPageUnload"]();
                this.UnloadPageFunctions();
                this.EvalScript(xhttp.responseText, "6969_Script");
                let content = document.getElementById(target);
                content.innerHTML = xhttp.responseText;
                if (window["OnPageLoad"] !== undefined)
                    window["OnPageLoad"]();
            }
        }.bind(this);
        xhttp.open("GET", fileName, true);
        xhttp.send();
    }

    SendData(obj, callback) {
        this.Connection.SendData(obj, callback);
    }


    SendCustomCommand(command, args, callback) {
        this.Connection.SendCustomCommand(command, args, callback);
    }

    OnOpen(event) {
        this.CbOnOpen(event);
    }

    OnError(event) {
        this.CbOnOpen(event);
    }

    OnClose(event) {
        this.CbOnOpen(event);
    }

    OnResource(rcv) {

    }

    OnMessage(rcv) {
        if (window["OnPageUnload"] !== undefined)
            window["OnPageUnload"]();
        this.UnloadPageFunctions();
        this.UnLoadDpConnectElements()
        let content = document.getElementById(rcv.target);
        content.innerHTML = rcv.data;
        this.EvalScript(rcv.data, "6969_Script");
        if (window["OnPageLoad"] !== undefined)
            window["OnPageLoad"](rcv.args.params);
        this.TraverseAndUpdateDOM();
        this.RenderDpGetElements();
        this.RenderDpConnectElements();
    }


    UnloadPageFunctions() {
        window["OnPageUnload"] = undefined;
        window["OnPageLoad"] = undefined;
    }

    ClearScript(scriptSuffix) {
        let elems = document.getElementsByClassName(scriptSuffix);
        for (var i = 0; i < elems.length; i++)
            document.body.removeChild(elems[i]);
    }

    EvalScript(txt, scriptSuffix) {
        let start = 0;
        let slen = String("<script>").length;
        let elen = String("</script>").length;
        let cnt = 0;
        let html = "";
        this.ClearScript(scriptSuffix);

        while (start >= 0) {
            let end = start;
            start = txt.indexOf("<script>", start);
            if (start < 0)
                break;
            end = txt.indexOf("</script>", start + 1);
            if (end < 0) {
                console.error("missing </script>");
                break;
            }
            let script = txt.substr(start + slen, end - start - elen);
            start = end;
            var js = document.createElement('script');
            js.classList.add(scriptSuffix);
            js.id = scriptSuffix + cnt;
            js.text = script;
            document.body.appendChild(js);
            cnt++;
        }
        // CSS
        start = 0;
        slen = String("<style>").length;
        elen = String("</style>").length;
        cnt = 0;
        while (start >= 0) {
            let end = start;
            start = txt.indexOf("<style>", start);
            if (start < 0)
                break;
            end = txt.indexOf("</style>", start + 1);
            if (end < 0) {
                console.error("missing </style>");
                break;
            }
            let script = txt.substr(start + slen, end - start - elen);
            start = end;
            // IME ADD FULL FILE
            //var fileref = document.createElement('style')
            //fileref.setAttribute("type", "text/css")
            //fileref.setAttribute("src", "");
            var style = document.createElement('style');
            style.type = 'text/css';
            style.id = "OneCSS_" + cnt;
            document.getElementsByTagName('head')[0].appendChild(style);
            style.innerHTML = script;
        }
    }

    TraverseAndUpdateDOM() {
        // Sammle alle Elemente mit dpGet oder dpConnect Attributen
        const elements = document.querySelectorAll('[dpGet], [dpConnect]');

        // Durchlaufe die gefundenen Elemente
        elements.forEach(element => {
            // Prüfe dpGet Attribut
            if (element.hasAttribute('dpGet')) {
                const key = element.getAttribute('dpGet');
                this.dpGetElements.push(element);
            }

            // Prüfe dpConnect Attribut
            if (element.hasAttribute('dpConnect')) {
                const key = element.getAttribute('dpConnect');
                this.dpConnectElements.push(element);
            }
        });
    }

    RenderDpGetElements() {
        this.dpGetElements.forEach(element => {
            const key = element.getAttribute('dpGet');
            this.GetDbClient().DpGet(key, (rcv) => {
                if (rcv.data && rcv.data.value !== undefined) {
                    if(typeof rcv.data.value === 'object' && rcv.data.value !== null) {
                        this.RenderJsonToCollapsibleHtml(rcv.data.value, element);
                    }
                    else{
                        element.innerHTML = rcv.data.value;
                    }
                    
                } else {
                    console.warn(`No value found for dpGet: ${key}`);
                }
            });
        });
    }

    RenderDpConnectElements() {
        this.dpConnectElements.forEach(element => {
            const key = element.getAttribute('dpConnect');
            this.GetDbClient().DpConnect(key, (rcv) => {
                if (rcv.data && rcv.data.value !== undefined) {
                    if(typeof rcv.data.value === 'object' && rcv.data.value !== null) {
                        this.RenderJsonToCollapsibleHtml(rcv.data.value, element);
                    }
                    else{
                        element.innerHTML = rcv.data.value;
                    }
                } else {
                    console.warn(`No value found for dpConnect: ${key}`);
                }
            });
        });
    }

    UnLoadDpConnectElements() {
        this.dpConnectElements.forEach(element => {
            const key = element.getAttribute('dpConnect');
            this.GetDbClient().DpDisconnect(key, (rcv) => {
                if (rcv.data && rcv.data.value !== undefined) {
                    element.innerHTML = rcv.data.value;
                } else {
                    console.warn(`No value found for dpDisconnect: ${key}`);
                }
            });
        });
        this.dpConnectElements = [];
    }

    RenderJsonToCollapsibleHtml(jsonData, targetElement) {
        if (!targetElement) {
            console.error('Ziel-Element mit ID ' + targetElementId + ' nicht gefunden');
            return;
        }

        // Rekursive Funktion zum Erstellen der HTML-Struktur
        function createCollapsibleHtml(data, depth = 0) {
            let html = '';

            // Typ des Datenobjekts prüfen
            if (Array.isArray(data)) {
                html += `<div class="json-array" style="margin-left: ${depth * 20}px;">
                <span class="json-toggle">[${data.length}]</span>
                <div class="json-content" style="display: none;">`;
                data.forEach((item, index) => {
                    html += `<div class="json-item">[${index}]: ${createCollapsibleHtml(item, depth + 1)}</div>`;
                });
                html += '</div></div>';
            } else if (data && typeof data === 'object') {
                html += `<div class="json-object" style="margin-left: ${depth * 20}px;">
                <span class="json-toggle">{${Object.keys(data).length}}</span>
                <div class="json-content" style="display: none;">`;
                for (const [key, value] of Object.entries(data)) {
                    html += `<div class="json-item">"${key}": ${createCollapsibleHtml(value, depth + 1)}</div>`;
                }
                html += '</div></div>';
            } else {
                // Primitive Werte (String, Number, Boolean, null)
                html += `<span class="json-value">${JSON.stringify(data)}</span>`;
            }

            return html;
        }

        // HTML generieren und ins Ziel-Element einfügen
        targetElement.innerHTML = createCollapsibleHtml(jsonData);

        // Event-Listener für Klappfunktion hinzufügen
        targetElement.querySelectorAll('.json-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const content = toggle.nextElementSibling;
                content.style.display = content.style.display === 'none' ? 'block' : 'none';
                toggle.textContent = toggle.textContent.includes('▼')
                    ? toggle.textContent.replace('▼', '▶')
                    : toggle.textContent.replace('▶', '▼');
            });
        });
    }
}


class IME_DBClient {
    constructor(connection) {
        this.Connection = connection;
        this.DpConnectionTable = new Map();
    }

    DpGet(dpName, callback) {
        const request = { dpName: dpName };
        this.Connection.SendCustomCommand("DpGet", request, callback);
    }

    DpSet(dpName, value, callback) {
        const request = { dpName: dpName, value: value };
        this.Connection.SendCustomCommand("DpSet", request, callback);
    }

    OnDpConnect(rcv) {
        if (rcv.data.rc == 200) {
            if (this.DpConnectionTable.has(rcv.data.dpName)) {
                var callbacks = this.DpConnectionTable.get(rcv.data.dpName);
                for (var i = 0; i < callbacks.length; i++) {
                    callbacks[i](rcv);
                }
            }
        }
        var obj = null;
        if(rcv.data && rcv.data.dpName)
            obj = rcv.data        
        else if(rcv.data.data && rcv.data.data.dpName)
            obj = rcv.data.data;

        if (obj && this.DpConnectionTable.has(obj.dpName)) {
            var callbacks = this.DpConnectionTable.get(obj.dpName);
            for (var i = 0; i < callbacks.length; i++) {
                callbacks[i](rcv.data);
            }
        }
    }

    OnDpDisconnect(rcv) {
        if (rcv.data.rc == 200) {
            return; // connection confirmation good
        }
        if (this.DpConnectionTable.has(rcv.data.data.dpName)) {
            var callbacks = this.DpConnectionTable.get(rcv.data.data.dpName);
            for (var i = 0; i < callbacks.length; i++) {
                callbacks[i](rcv.data);
            }
        }
    }

    DpConnect(dpName, callback) {
        if (this.DpConnectionTable.has(dpName)) {
            this.DpConnectionTable.get(dpName).push(callback);
            return;
        }
        else {
            var dpCallbacks = new Array();
            dpCallbacks.push(callback);
            this.DpConnectionTable.set(dpName, dpCallbacks);
            const request = { dpName: dpName };
            this.Connection.SendCustomCommand("DpConnect", request, this.OnDpConnect.bind(this), true);
        }
    }

    DpDisconnect(dpName, callback) {
        const request = { dpName: dpName };
        if (this.DpConnectionTable.has(dpName)) {
            if (this.DpConnectionTable.get(dpName).length > 0) {
                var callbacks = this.DpConnectionTable.get(dpName);
                for (var i = 0; i < callbacks.length; i++) {
                    if (callbacks[i] == callback) {
                        callbacks.splice(i, 1);
                        break;
                    }
                }
            }
        }
        if (this.DpConnectionTable.has(dpName) && this.DpConnectionTable.get(dpName).length == 0) {
            this.DpConnectionTable.delete(dpName);
            this.Connection.SendCustomCommand("DpDisconnect", request, this.OnDpDisconnect.bind(this), true);
        }
    }

    DpCreate(dpName, type, callback) {
        const request = { dpName: dpName, type: type };
        this.Connection.SendCustomCommand("DpCreate", request, callback);
    }

    DpNames(typeName, pattern, callback) {
        const request = { typeName: typeName, pattern: pattern };
        this.Connection.SendCustomCommand("DpNames", request, callback);
    }    
    
    DpTypes(pattern, callback) {
        const request = { pattern: pattern };
        this.Connection.SendCustomCommand("DpTypes", request, callback);
    }

    DpGetPeriod(dpName, startTs, endTs, callback) {
        const request = { dpName: dpName , startTs: startTs, endTs: endTs };
        this.Connection.SendCustomCommand("DpGetPeriod", request, callback);
    }


    DiscoverDevices(ipRange, callback) {
        const request = { ipRange: ipRange };
        this.Connection.SendCustomCommand("DiscoverDevices", request, callback);
    }
    
    GetSNMPMetrics(ip, version, endTs, callback) {
        const request = { ip: ip , version: version };
        this.Connection.SendCustomCommand("GetSNMPMetrics", request, callback);
    }
    
     ListDevices(callback) {
        const request = {  };
        this.Connection.SendCustomCommand("ListDevices", request, callback);
    }
    
    ConfigureSNMPTraps(enable, callback) {
        const request = { enable: enable };
        this.Connection.SendCustomCommand("ConfigureSNMPTraps", request, callback);
    }   

}