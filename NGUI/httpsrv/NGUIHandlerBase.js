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
        if(msg.originalWsId)
            data.originalWsId = msg.originalWsId;
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

module.exports = NGUIHandlerBase;