class NGUICB
{
    constructor()
    {
        this.tok = 0;
        this.callback = null;
    }
}

class NGUIMsg
{
    static msgCounter = 0;

    constructor()
    {
        this.tok = NGUIMsg.msgCounter++;
        this.cmd = "";
        this.args = new Object();
    }
}

class NGUIConnection
{
    constructor(ui)
    {
        this.Connection = null;
        this.UI = ui;
        this.callBacks = new Array();
    }

    Log(msg, inLvl) 
    {
        const lvl = 10;
        if(lvl >= inLvl)
            console.log(msg);
    }

    LoadPage(fileName, target, params, callback)
    {
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

    LoadResource(fileName, params, callback)
    {
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
	
    SendData(obj, target, callback)
    {
        var msg = new NGUIMsg();
        msg.cmd = "SendData";
        msg.args.data = obj;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        cb.target = target;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }	
	
    DpConnect(obj, target, callback)
    {
        console.log("Connectasdasd")
        var msg = new NGUIMsg();
        msg.cmd = "DpConnect";
        msg.args.data = obj;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        cb.target = target;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }	

    SetArmValues(obj, target, callback)
    {
        var msg = new NGUIMsg();
        msg.cmd = "SetArmValues";
        msg.args.data = obj;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        cb.target = target;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }	
	
    SetPercentage(obj, target, callback)
    {
        var msg = new NGUIMsg();
        msg.cmd = "SetPercentage";
        msg.args.data = obj;
        var cb = new NGUICB();
        cb.tok = msg.tok;
        cb.callback = callback;
        cb.target = target;
        this.callBacks.push(cb);
        this.Connection.send(JSON.stringify(msg));
    }	

    Log(str, lvl)
    {
        if (lvl > 10)
        console.log(str);
    }
	

    Connect(url, callback)
    {
        this.Connection = new WebSocket(url, "protocolOne");
        this.Connection.onopen = function (event) 
        {
            this.Log("onopen", 10);
            if(this.UI)
                this.UI.OnOpen(event);
        }.bind(this);

        this.Connection.onerror = function (event) 
        {
            this.Log("onerror", 9);
            if(this.UI)
                this.UI.OnError(event);            
        }.bind(this);      

        this.Connection.onclose = function (event) 
        {
            this.Log("onclose!", 10);
            if(this.UI)
                this.UI.OnClose(event);        
        }.bind(this);         

        this.Connection.onmessage = function (event) 
        {
            this.Log("onmessage!", 10);
            try{
                var rcv = JSON.parse(event.data);
                for(var i=0;i<this.callBacks.length;i++)
                {
                    if(rcv.tok == this.callBacks[i].tok)
                    {
                        rcv.target = this.callBacks[i].target;
                        this.callBacks[i].callback(rcv);
                        this.callBacks.splice(i, 1);
                        break;
                    }
                }     
            }
            catch(e)
            {
				console.log(e);
			}
        }.bind(this);               
    }
}

class NGUIUI
{
    constructor()
    {
        this.Connection = null;
    }

    Connect(url, onOpen)
    {
        this.CbOnOpen = onOpen;
        this.Connection = new NGUIConnection(this);
        this.Connection.Connect(url);
    }

    LoadPage(fileName, target, params)
    {
        this.Connection.LoadPage(fileName, target, params, this.OnMessage.bind(this));
    }

    LoadResource(fileName, params, callback)
    {
        this.Connection.LoadResource(fileName, params, callback);
    }    

    LoadPageAJAX(fileName, target)
    {
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
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

    SendData(obj, callback)
    {
        this.Connection.SendData(obj, null, callback);
    }    

    SetTowerValues(obj, target)
    {
        this.Connection.SetTowerValues(obj, target, this.OnMessage.bind(this));
    }    
	
    SetArmValues(obj, target)
    {
        this.Connection.SetArmValues(obj, target, this.OnMessage.bind(this));
    }  	
	
    SetPercentage(obj, target)
    {
        this.Connection.SetPercentage(obj, target, this.OnMessage.bind(this));
    }  	

    OnOpen(event)
    {
        this.CbOnOpen(event);
    }

    OnError(event)
    {
        this.CbOnOpen(event);
    }
    
    OnClose(event)
    {
        this.CbOnOpen(event);
    }
    
    OnResource(rcv)
    {
       
    }  

    OnMessage(rcv)
    {
        if (window["OnPageUnload"] !== undefined)
            window["OnPageUnload"]();
        this.UnloadPageFunctions();
        let content = document.getElementById(rcv.target);
        content.innerHTML = rcv.data;
        this.EvalScript(rcv.data, "6969_Script");
        if (window["OnPageLoad"] !== undefined)
            window["OnPageLoad"](rcv.args.params);        
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
}