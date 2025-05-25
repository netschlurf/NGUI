class NGUIHandlerBase {
    constructor() {
    }

    /**
     * Sends a response over WebSocket.
     * @param {WebSocket} ws - The WebSocket instance.
     * @param {Object} msg - The original message.
     * @param {string} data - The response data.
     * @param {string} [err] - The error code, if any.
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

    /**
     * Returns the root directory for htdocs.
     * @returns {string} The htdocs root path.
     */
    GetHtdocsRoot() {
        return "";
    }

    /**
     * Handles the closure of a WebSocket connection.
     * @param {WebSocket} ws - The WebSocket instance that was closed.
     */
    OnWebsocketClosed(ws) {
        // Empty implementation in the base class
    }
}

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
            'DpNames': this.DpNames.bind(this),
            'DpTypes': this.DpTypes.bind(this), // <-- hinzugefügt
        };  
        this.DpConnectionMap = new Map();    
    }

    /**
     * Processes incoming WebSocket messages and dispatches them to the appropriate command handler.
     * @param {WebSocket} ws - The WebSocket instance.
     * @param {Object} msg - The incoming message with command and arguments.
     */
    OnHandle(ws, msg) {
        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return;
        }
    }

    /**
     * Cleans up all DpConnect callbacks associated with a closed WebSocket.
     * Removes all connections for the given WebSocket from DpConnectionMap and
     * calls db.DpDisconnect for any dpName that has no remaining connections.
     * @param {WebSocket} ws - The WebSocket instance that was closed.
     * @example
     * // After a browser closes, OnWebsocketClosed is called:
     * // If DpConnectionMap had: Map { "myCounter" => [{msg: ..., ws: ws1}, {msg: ..., ws: ws2}] }
     * // And ws1 closes, the method removes ws1's connections:
     * // Result: Map { "myCounter" => [{msg: ..., ws: ws2}] }
     * // If ws2 also closes, DpConnectionMap becomes empty and db.DpDisconnect("myCounter") is called.
     */
    OnWebsocketClosed(ws) {
        try {
            // Iterate through all entries in DpConnectionMap
            for (const [dpName, connections] of this.DpConnectionMap.entries()) {
                // Remove all connections associated with the closed WebSocket
                const updatedConnections = connections.filter(conn => conn.ws !== ws);
                if (updatedConnections.length === 0) {
                    // If no connections remain for this dpName
                    this.DpConnectionMap.delete(dpName);
                    this.db.DpDisconnect(dpName, () => {
                        console.log(`Disconnected dpName: ${dpName} due to WebSocket close`);
                    });
                } else {
                    // Update the connection list
                    this.DpConnectionMap.set(dpName, updatedConnections);
                }
            }
            console.log('DpConnectionMap after WebSocket close:', [...this.DpConnectionMap.entries()]);
        } catch (err) {
            console.error('Error in OnWebsocketClosed:', err);
        }
    }

    /**
     * Retrieves the value of a data point from the database.
     * @param {Object} msg - The incoming message with dpName in args.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    DpGet(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300};
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

    /**
     * Sets the value of a data point in the database.
     * @param {Object} msg - The incoming message with dpName and value in args.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    DpSet(msg, ws) {
        if (!msg.args || !msg.args.dpName || msg.args.value === undefined) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300};
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            this.db.DpSet(msg.args.dpName, msg.args.value);
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 200};
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 400};
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    /**
     * Handles updates from the database for connected data points.
     * Notifies all clients subscribed to the dpName with the updated value.
     * @param {string} dpName - The name of the data point.
     * @param {*} value - The updated value of the data point.
     * @param {Array} callBacks - Array of {msg, ws} objects for connected clients.
     */
    OnDpConnect(dpName, value, callBacks) {
        for (var i = 0; i < callBacks.length; i++) {
            const rsp = {};
            rsp.data = {cmd: callBacks[i].msg.cmd, dpName: dpName, value: value};
            this.sendResponse(callBacks[i].ws, callBacks[i].msg, rsp);
        }
    }

    /**
     * Connects a WebSocket client to a data point and registers it in DpConnectionMap.
     * If the dpName is new, establishes a database connection via db.DpConnect.
     * @param {Object} msg - The incoming message with dpName in args.
     * @param {WebSocket} ws - The WebSocket instance.
     * @example
     * // Client sends: {cmd: "DpConnect", args: {dpName: "myCounter"}, tok: "123"}
     * // DpConnectionMap updated: Map { "myCounter" => [{msg: ..., ws: ws1}] }
     * // Response: {data: {cmd: "DpConnect", dpName: "myCounter", value: <value>, rc: 200}, ...}
     */
    DpConnect(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300};
            this.sendResponse(ws, msg, null, rsp);
            return;
        }
        const dpName = msg.args.dpName.trim(); // Ensure no invisible characters in dpName
        try {
            // Initialize array for dpName if not present
            if (!this.DpConnectionMap.has(dpName)) {
                this.DpConnectionMap.set(dpName, []);
                // Establish database connection only for new dpName
                this.db.DpConnect(dpName, (dpName, value) => {
                    this.OnDpConnect(dpName, value, this.DpConnectionMap.get(dpName));
                });
            }
            // Add the connection
            this.DpConnectionMap.get(dpName).push({msg: msg, ws: ws});
            const rsp = {cmd: msg.cmd, dpName: dpName, value: this.db.DpGet(dpName), rc: 200};
            this.sendResponse(ws, msg, rsp);         
        } catch (err) {
            console.error('Error in DpConnect:', err);
            const rsp = {cmd: msg.cmd, dpName: dpName, rc: 400};
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    /**
     * Disconnects a WebSocket client from a data point and removes it from DpConnectionMap.
     * Calls db.DpDisconnect only if no connections remain for the dpName.
     * @param {Object} msg - The incoming message with dpName in args.
     * @param {WebSocket} ws - The WebSocket instance.
     * @example
     * // Client sends: {cmd: "DpDisconnect", args: {dpName: "myCounter"}, tok: "123"}
     * // If DpConnectionMap was: Map { "myCounter" => [{msg: ..., ws: ws1}] }
     * // After disconnect: Map {}
     * // db.DpDisconnect("myCounter") is called.
     * // Response: {data: {cmd: "DpDisconnect", dpName: "myCounter", rc: 200}, ...}
     */
    DpDisconnect(msg, ws) {
        if (!msg.args || !msg.args.dpName) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300};
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const dpName = msg.args.dpName.trim(); // Ensure no invisible characters in dpName
            if (this.DpConnectionMap.has(dpName)) {
                // Remove the connection for the current WebSocket client
                this.DpConnectionMap.set(
                    dpName,
                    this.DpConnectionMap.get(dpName).filter(conn => conn.ws !== ws)
                );

                // If no connections remain for this dpName
                if (this.DpConnectionMap.get(dpName).length === 0) {
                    this.DpConnectionMap.delete(dpName);
                    this.db.DpDisconnect(dpName, (data) => {
                        const rsp = {cmd: msg.cmd, dpName: dpName, value: this.db.DpGet(dpName), rc: 200};
                        this.sendResponse(ws, msg, rsp);
                    });
                } else {
                    const rsp = {cmd: msg.cmd, dpName: dpName, rc: 200};
                    this.sendResponse(ws, msg, rsp);
                }
            } else {
                const rsp = {cmd: msg.cmd, dpName: dpName, rc: 200};
                this.sendResponse(ws, msg, rsp);
            }
        } catch (err) {
            console.error('Error in DpDisconnect:', err);
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 400};
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    /**
     * Creates a new data point in the database.
     * @param {Object} msg - The incoming message with name and type in args.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    DpCreate(msg, ws) {
        if (!msg.args || !msg.args.name || !msg.args.type) {
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 300};
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

    /**
     * Gibt alle Datenpunktnamen zurück, optional gefiltert nach Typ und/oder Pattern.
     * Pattern-Syntax:
     *   *   : Beliebig viele beliebige Zeichen (z.B. "temp*")
     *   ?   : Genau ein beliebiges Zeichen (z.B. "data??")
     *   [ ] : Ein Zeichen aus der Liste oder einem Bereich (z.B. "sensor[12]", "val[a-z]")
     * Beispiele:
     *   DpNames()                  // alle Namen
     *   DpNames("TempType")        // alle Namen vom Typ "TempType"
     *   DpNames(null, "temp*")     // alle Namen, die mit "temp" beginnen
     *   DpNames("TempType", "*1")  // alle Namen vom Typ "TempType", die auf "1" enden
     * 
     * @param {Object} msg - Erwartet msg.args.typeName und/oder msg.args.pattern
     * @param {WebSocket} ws
     */
    DpNames(msg, ws) {
        try {
            const typeName = msg.args && msg.args.typeName ? msg.args.typeName : null;
            const pattern = msg.args && msg.args.pattern ? msg.args.pattern : null;
            const names = this.db.DpNames(typeName, pattern);
            this.sendResponse(ws, msg, {cmd: msg.cmd, names: names, rc: 200});
        } catch (err) {
            console.error('Error in DpNames:', err);
            this.sendResponse(ws, msg, null, 'Error getting data point names');
        }
    }    

    /**
     * Gibt alle Datenpunkttypen zurück, optional gefiltert nach Pattern.
     * Pattern-Syntax:
     *   *   : Beliebig viele beliebige Zeichen (z.B. "Temp*")
     *   ?   : Genau ein beliebiges Zeichen (z.B. "Type??")
     *   [ ] : Ein Zeichen aus der Liste oder einem Bereich (z.B. "Type[12]", "Val[a-z]")
     * Beispiele:
     *   DpTypes()                // alle Typnamen
     *   DpTypes("Temp*")         // alle Typnamen, die mit "Temp" beginnen
     *   DpTypes("*Type")         // alle Typnamen, die auf "Type" enden
     *   DpTypes("T?pe[12]")      // z.B. "Type1", "Tipe2"
     * 
     * @param {Object} msg - Erwartet msg.args.pattern
     * @param {WebSocket} ws
     */
    DpTypes(msg, ws) {
        try {
            const pattern = msg.args && msg.args.pattern ? msg.args.pattern : null;
            const types = this.db.DpTypes(pattern);
            this.sendResponse(ws, msg, {cmd: msg.cmd, types: types, rc: 200});
        } catch (err) {
            console.error('Error in DpTypes:', err);
            this.sendResponse(ws, msg, null, 'Error getting data point types');
        }
    }
}

module.exports = IME_DBHandler;