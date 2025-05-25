class NGUIHandlerBase
{
    constructor() {
    }
          /**
     * Sends a response over WebSocket.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Original message.
     * @param {string} data - Response data.
     * @param {string} [err] - Error code, if any.
     */
    sendResponse(ws, msg, data, err = null) {
        const response = {
            data,
            args: msg.args || null,
            tok: msg.tok
        };
        if (err) {
            response.err = err;
        }
        ws.send(JSON.stringify(response));
    }

    GetHtdocsRoot()
    {
      return "";
    }
  }

class IME_DBHandler extends NGUIHandlerBase
{
    constructor(db) {
      super();
      this.db = db;
        this.commandMap = {
            'DpGet': this.DpGet.bind(this),
            'DpSet': this.DpSet.bind(this),
            'DpConnect': this.DpConnect.bind(this),
            'DpDisconnect': this.DpDisconnect.bind(this),
            'DpCreate': this.DpCreate.bind(this),
        };  
        this.DpConnectionMap = new Map();    
    }

    OnHandle(ws, msg) {
        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return;
        }
    }

    DpGet(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300}
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const data = {cmd: msg.cmd, dpName: msg.args.dpName, value: this.db.DpGet(msg.args.dpName)};
            this.sendResponse(ws, msg, data);
        } catch (err) {
            console.error('Error getting data point:', err);
            this.sendResponse(ws, msg, null, 'Error getting data point');
        }
    }

    DpSet(msg, ws) {
        if (!msg.args || !msg.args.dpName || msg.args.value === undefined) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300}
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            this.db.DpSet(msg.args.dpName, msg.args.value);
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 200}
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 400}
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    OnDpConnect(dpName, value, callBacks)
    {
        for(var i=0;i<callBacks.length;i++)
        {
            const rsp = {};
            rsp.data = {cmd: callBacks[i].msg.cmd, dpName: dpName, value: value};
            this.sendResponse(callBacks[i].ws, callBacks[i].msg, rsp);
        }
    }

    DpConnect(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300}
            this.sendResponse(ws, msg, null, rsp);
            return;
        }
        var dpName = msg.args.dpName;
        try {
            if(this.DpConnectionMap.has(dpName))
            {
                if(!this.DpConnectionMap[dpName])
                    this.DpConnectionMap[dpName] = new Array();
                this.DpConnectionMap[dpName].push({msg: msg, ws: ws});
            }            
            else
            {
                this.db.DpConnect(msg.args.dpName, (dpName, value) => {
                    this.OnDpConnect(dpName, value, this.DpConnectionMap[dpName]);
                });
                if(!this.DpConnectionMap[dpName])
                    this.DpConnectionMap[dpName] = new Array();
                this.DpConnectionMap[dpName].push({msg: msg, ws: ws});
            }
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, value: this.db.DpGet(msg.args.dpName), rc: 200}
            this.sendResponse(ws, msg, rsp);         
        } catch (err) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 400}
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    DpDisconnect(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300}
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            this.db.DpDisconnect(msg.args.dpName, (data) => {
                const rsp = {};
                rsp.data = {cmd: msg.cmd, dpName: msg.args.dpName, value: this.db.DpGet(msg.args.dpName)};
                this.sendResponse(ws, msg, rsp);
            });
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 200}
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            const rsp = {dpName: msg.args.dpName, rc: 400}
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    DpCreate(msg, ws) {
        if (!msg.args || !msg.args.name || !msg.args.type) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300}
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const dataPoint = this.db.DpCreate(msg.args.name, msg.args.type);
            this.sendResponse(ws, msg, {name: dataPoint.name, type: dataPoint.typeName});
        } catch (err) {
            console.error('Error creating data point:', err);
            this.sendResponse(ws, msg, null, 'Error creating data point');
        }
    }
}

module.exports = IME_DBHandler;