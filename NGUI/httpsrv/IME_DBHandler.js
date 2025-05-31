const NGUIHandlerBase = require('./NGUIHandlerBase');

class IME_DBHandler extends NGUIHandlerBase {
  constructor(db) {
    super();
    this.db = db;
    this.commandMap = {
      'DpGet': this.DpGet.bind(this),
      'DpSet': this.DpSet.bind(this),
      'DpConnect': this.DpConnect.bind(this),
      'DpDisconnect': this.DpDisconnect.bind(this),
      'DpCreate': this.DpCreate.bind(this),
      'DpDelete': this.DpDelete.bind(this),
      'DpNames': this.DpNames.bind(this),
      'DpTypes': this.DpTypes.bind(this),
      'DpExists': this.DpExists.bind(this),
      'DpTypeExists': this.DpTypeExists.bind(this),
      'DpRename': this.DpRename.bind(this),
    };
    this.DpConnectionMap = new Map();
  }

  OnHandle(ws, msg) {
    if (this.commandMap[msg.cmd]) {
      this.commandMap[msg.cmd](msg, ws);
      return true;
    }
    return false;
  }

  OnWebsocketClosed(ws) {
    try {
      for (const [dpName, connections] of this.DpConnectionMap.entries()) {
        const updatedConnections = connections.filter(conn => conn.ws !== ws);
        if (updatedConnections.length === 0) {
          this.DpConnectionMap.delete(dpName);
          this.db.DpDisconnect(dpName, () => {
            console.log(`Disconnected dpName: ${dpName} due to WebSocket close`);
          });
        } else {
          this.DpConnectionMap.set(dpName, updatedConnections);
        }
      }
      console.log('DpConnectionMap after WebSocket close:', [...this.DpConnectionMap.entries()]);
    } catch (err) {
      console.error('Error in OnWebsocketClosed:', err);
    }
  }

  DpTypeExists(msg, ws) {
    if (!msg.args || !msg.args.type) {
      const rsp = { cmd: msg.cmd, type: msg.args?.type ?? null, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
    }

    try {
      const exists = this.db.DpTypeExists(msg.args.type);
      const rsp = { cmd: msg.cmd, type: msg.args.type, exists: exists, rc: 200 };
      this.sendResponse(ws, msg, rsp);
    } catch (err) {
      console.error('Error in DpTypeExists:', err);
      const rsp = { cmd: msg.cmd, type: msg.args.type, rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpRename(msg, ws) {
    if (!msg.args || !msg.args.dpName || !msg.args.newName) {
      const rsp = { cmd: msg.cmd, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }
    try {
      const result = this.db.DpRename(msg.args.dpName, msg.args.newName);
      this.sendResponse(ws, msg, { cmd: msg.cmd, ...result, rc: 200 });
    } catch (err) {
      console.error('Error in DpRename:', err);
      this.sendResponse(ws, msg, null, 'Error renaming datapoint');
    }
  }

  DpExists(msg, ws) {
    if (!msg.args || !msg.args.dpName) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName.trim();
      const exists = this.db.DpExists(dpName);
      const rsp = { cmd: msg.cmd, dpName: dpName, exists: exists, rc: 200 };
      this.sendResponse(ws, msg, rsp);
    } catch (err) {
      console.error('Error in DpExists:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpGet(msg, ws) {
    if (!msg.args || !msg.args.dpName) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName;
      if (Array.isArray(dpName)) {
        const results = this.db.DpGet(dpName);
        const data = dpName.map((name, index) => ({
          cmd: msg.cmd,
          dpName: name,
          value: results[index],
          rc: 200
        }));
        this.sendResponse(ws, msg, data);
      } else {
        const value = this.db.DpGet(dpName);
        const data = { cmd: msg.cmd, dpName: dpName, value: value, rc: 200 };
        this.sendResponse(ws, msg, data);
      }
      return true;
    } catch (err) {
      console.error('Error getting data point:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, msg: 'Error getting data point', rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
  }

  DpSet(msg, ws) {
    if (!msg.args || !msg.args.dpName || msg.args.value === undefined) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, msg: 'missing args', rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName;
      const value = msg.args.value;
      if (Array.isArray(dpName)) {
        this.db.DpSet(dpName, value);
        const data = dpName.map(name => ({ cmd: msg.cmd, dpName: name, rc: 200 }));
        this.sendResponse(ws, msg, data);
      } else {
        this.db.DpSet(dpName, value);
        const rsp = { cmd: msg.cmd, dpName: dpName, rc: 200 };
        this.sendResponse(ws, msg, rsp);
      }
      return true;
    } catch (err) {
      console.error('Error in DpSet:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, msg: 'internal error', rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
  }

  OnDpConnect(dpName, value, callBacks) {
    for (var i = 0; i < callBacks.length; i++) {
      const rsp = {};
      rsp.data = { cmd: callBacks[i].msg.cmd, dpName: dpName, value: value };
      this.sendResponse(callBacks[i].ws, callBacks[i].msg, rsp);
    }
  }

  DpConnect(msg, ws) {
    if (!msg.args || !msg.args.dpName) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }
    const dpName = msg.args.dpName;
    try {
      if (Array.isArray(dpName)) {
        if (!this.DpConnectionMap.has(dpName)) {
          this.db.DpConnect(dpName, (dpName, value) => {
            for (const [key, callback] of this.DpConnectionMap.entries()) {
              if (dpName.includes(key)) {
                this.OnDpConnect(dpName, value, callback);
              }
            }
          });
        }
        const results = this.db.DpGet(dpName);
        const data = dpName.map((name, index) => {
          if (!this.DpConnectionMap.has(name)) {
            this.DpConnectionMap.set(name, []);
          }
          this.DpConnectionMap.get(name).push({ msg: msg, ws: ws });
          return { cmd: msg.cmd, dpName: name, value: results[index], rc: 200 };
        });
        this.sendResponse(ws, msg, data);
      } else {
        const dpNameTrimmed = dpName.trim();
        if (!this.DpConnectionMap.has(dpNameTrimmed)) {
          this.DpConnectionMap.set(dpNameTrimmed, []);
          this.db.DpConnect(dpNameTrimmed, (dpName, value) => {
            for (const [key, callback] of this.DpConnectionMap.entries()) {
              if (dpName.includes(key)) {
                this.OnDpConnect(dpName, value, callback);
              }
            }
          });
        }
        this.DpConnectionMap.get(dpNameTrimmed).push({ msg: msg, ws: ws });
        const value = this.db.DpGet(dpNameTrimmed);
        const rsp = { cmd: msg.cmd, dpName: dpNameTrimmed, value: value, rc: 200 };
        this.sendResponse(ws, msg, rsp);
      }
    } catch (err) {
      console.error('Error in DpConnect:', err);
      const rsp = { cmd: msg.cmd, dpName: dpName, rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpDisconnect(msg, ws) {
    if (!msg.args || !msg.args.dpName) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName;
      if (Array.isArray(dpName)) {
        const data = [];
        for (const name of dpName) {
          const nameTrimmed = name.trim();
          if (this.DpConnectionMap.has(nameTrimmed)) {
            this.DpConnectionMap.set(
              nameTrimmed,
              this.DpConnectionMap.get(nameTrimmed).filter(conn => conn.ws !== ws)
            );
            if (this.DpConnectionMap.get(nameTrimmed).length === 0) {
              this.DpConnectionMap.delete(nameTrimmed);
              this.db.DpDisconnect(nameTrimmed);
            }
            const value = this.db.DpGet(nameTrimmed);
            data.push({ cmd: msg.cmd, dpName: nameTrimmed, value: value, rc: 200 });
          } else {
            data.push({ cmd: msg.cmd, dpName: nameTrimmed, rc: 200 });
          }
        }
        this.sendResponse(ws, msg, data);
      } else {
        const dpNameTrimmed = dpName.trim();
        if (this.DpConnectionMap.has(dpNameTrimmed)) {
          this.DpConnectionMap.set(
            dpNameTrimmed,
            this.DpConnectionMap.get(dpNameTrimmed).filter(conn => conn.ws !== ws)
          );
          if (this.DpConnectionMap.get(dpNameTrimmed).length === 0) {
            this.DpConnectionMap.delete(dpNameTrimmed);
            this.db.DpDisconnect(dpNameTrimmed, (data) => {
              const rsp = { cmd: msg.cmd, dpName: dpNameTrimmed, value: this.db.DpGet(dpNameTrimmed), rc: 200 };
              this.sendResponse(ws, msg, rsp);
              return true;
            });
          } else {
            const rsp = { cmd: msg.cmd, dpName: dpNameTrimmed, rc: 200 };
            this.sendResponse(ws, msg, rsp);
            return true;
          }
        } else {
          const rsp = { cmd: msg.cmd, dpName: dpNameTrimmed, rc: 200 };
          this.sendResponse(ws, msg, rsp);
          return true;
        }
      }
    } catch (err) {
      console.error('Error in DpDisconnect:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpCreate(msg, ws) {
    if (!msg.args || !msg.args.dpName || !msg.args.type) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName;
      const type = msg.args.type;
      if (Array.isArray(dpName)) {
        if (!Array.isArray(type) || type.length !== dpName.length) {
          const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, msg: 'type must be an array of same length as dpName', rc: 300 };
          this.sendResponse(ws, msg, null, rsp);
          return;
        }
        const dataPoints = this.db.DpCreate(dpName, type);
        const data = dataPoints.map((dp, index) => ({ name: dpName[index], type: type[index], rc: 200 }));
        this.sendResponse(ws, msg, data);
      } else {
        const dataPoint = this.db.DpCreate(dpName, type);
        this.sendResponse(ws, msg, { name: dpName, type: type, rc: 200 });
      }
    } catch (err) {
      console.error('Error creating data point:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, msg: 'Error creating data point', rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpDelete(msg, ws) {
    if (!msg.args || !msg.args.dpName) {
      const rsp = { cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300 };
      this.sendResponse(ws, msg, null, rsp);
      return;
    }

    try {
      const dpName = msg.args.dpName;
      if (Array.isArray(dpName)) {
        this.db.DpDelete(dpName);
        const data = dpName.map(name => ({ name: name, rc: 200 }));
        this.sendResponse(ws, msg, data);
      } else {
        this.db.DpDelete(dpName);
        this.sendResponse(ws, msg, { name: dpName, rc: 200 });
      }
    } catch (err) {
      console.error('Error deleting data point:', err);
      const rsp = { cmd: msg.cmd, dpName: msg.args.dpName, msg: 'Error deleting data point', rc: 400 };
      this.sendResponse(ws, msg, null, rsp);
    }
    return true;
  }

  DpNames(msg, ws) {
    try {
      const typeName = msg.args && msg.args.typeName ? msg.args.typeName : null;
      const pattern = msg.args && msg.args.pattern ? msg.args.pattern : null;
      const names = this.db.DpNames(typeName, pattern);
      this.sendResponse(ws, msg, { cmd: msg.cmd, names: names, rc: 200 });
    } catch (err) {
      console.error('Error in DpNames:', err);
      this.sendResponse(ws, msg, null, 'Error getting data point names');
    }
  }

  DpTypes(msg, ws) {
    try {
      const pattern = msg.args && msg.args.pattern ? msg.args.pattern : null;
      const types = this.db.DpTypes(pattern);
      this.sendResponse(ws, msg, { cmd: msg.cmd, types: types, rc: 200 });
    } catch (err) {
      console.error('Error in DpTypes:', err);
      this.sendResponse(ws, msg, null, 'Error getting data point types');
    }
  }
}

module.exports = IME_DBHandler;