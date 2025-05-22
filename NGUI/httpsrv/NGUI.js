const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

/**
 * NGUI server for HTTP and WebSocket communication on the same port.
 * Designed for clean, modular code in the style of an experienced C++ developer.
 */
class NGUI {
    /**
     * Constructor.
     * @param {number} port - Port for HTTP and WebSocket (default: 2808).
     */
    constructor(port = 2808) {
        this.port = port;
        this.server = null;
        this.wss = null;
        this.handlers = [];
    }

    /**
     * Registers a handler for incoming WebSocket messages.
     * @param {function} handler - Callback function for message processing.
     */
    registerHandler(handler) {
        this.handlers.push(handler);
    }

    /**
     * Starts the HTTP and WebSocket server.
     */
    start() {
        this.server = http.createServer(this.handleHttpRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', this.handleWebSocketConnection.bind(this));
        this.server.listen(this.port, () => {
            console.log(`Server running on port ${this.port}`);
        });
    }

    /**
     * Handles incoming HTTP requests, serving index.html for root or empty URLs.
     * @param {http.IncomingMessage} req - HTTP request.
     * @param {http.ServerResponse} res - HTTP response.
     */
    handleHttpRequest(req, res) {
        const baseUrl = req.url.split('?')[0];
        const filePath = (baseUrl === '/' || baseUrl === '') ? 'index.html' : baseUrl;
        this.serveFile(filePath, res);
    }

    /**
     * Handles new WebSocket connections.
     * @param {WebSocket} ws - WebSocket instance.
     */
    handleWebSocketConnection(ws) {
        console.log('WebSocket connected');
        ws.on('message', this.handleWebSocketMessage.bind(this, ws));
        ws.on('close', () => console.log('WebSocket closed'));
    }

    /**
     * Processes incoming WebSocket messages.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Buffer} message - Incoming message.
     */
    handleWebSocketMessage(ws, message) {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (err) {
            console.error('Invalid JSON:', err);
            return;
        }

        if (!msg || !msg.cmd) {
            return;
        }

        switch (msg.cmd) {
            case 'LoadPage':
            case 'LoadResource':
                this.serveResource(msg, ws);
                break;
            case 'DpSet':
            case 'DpGet':
            case 'DpConnect':
                this.handleDataPointCommand(msg);
                break;
            default:
                this.invokeCustomHandlers(ws, msg);
        }
    }

    /**
     * Closes the HTTP and WebSocket server.
     */
    close() {
        if (this.wss) {
            this.wss.close(() => console.log('WebSocket server closed'));
        }
        if (this.server) {
            this.server.close(() => console.log('HTTP server closed'));
        }
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

    /**
     * Serves a file from the filesystem for HTTP requests.
     * @param {string} filePath - Relative file path.
     * @param {http.ServerResponse} res - HTTP response.
     */
    async serveFile(filePath, res) {
        const fullPath = await this.resolveFilePath(filePath);
        if (!fullPath) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
        }

        try {
            const data = await fs.readFile(fullPath);
            const contentType = this.getContentType(fullPath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        } catch (err) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: err.message }));
        }
    }

    /**
     * Serves a resource for WebSocket requests.
     * @param {Object} msg - Incoming message.
     * @param {WebSocket} ws - WebSocket instance.
     */
    async serveResource(msg, ws) {
        if (!msg.args || !msg.args.fileName) {
            this.sendResponse(ws, msg, '', '400');
            return;
        }

        const fullPath = await this.resolveFilePath(msg.args.fileName);
        if (!fullPath) {
            this.sendResponse(ws, msg, '', '404');
            return;
        }

        try {
            const data = await fs.readFile(fullPath, 'utf8');
            this.sendResponse(ws, msg, data);
        } catch (err) {
            this.sendResponse(ws, msg, '', '404');
        }
    }

    /**
     * Resolves the full file path.
     * @param {string} filePath - Relative file path.
     * @returns {string|null} - Full path or null if not found.
     */
    async resolveFilePath(filePath) {
        const paths = [
            path.join("../", 'ngui', 'htdocs', filePath),
            path.join("../", 'htdocs', filePath)
        ];

        for (const fullPath of paths) {
            try {
                await fs.access(fullPath);
                return fullPath;
            } catch (err) {
                continue;
            }
        }
        return null;
    }

    /**
     * Determines the Content-Type based on file extension.
     * @param {string} filePath - File path.
     * @returns {string} - Content-Type.
     */
    getContentType(filePath) {
        if (filePath.endsWith('.js')) {
            return 'application/javascript';
        }
        if (filePath.endsWith('.html')) {
            return 'text/html';
        }
        if (filePath.endsWith('.css')) {
            return 'text/css';
        }
        return 'text/plain';
    }

    /**
     * Handles data point commands (DpSet, DpGet, DpConnect).
     * @param {Object} msg - Incoming message.
     */
    handleDataPointCommand(msg) {
        console.log(`Data point command: ${msg.cmd}`);
        // TODO: Implement logic for DpSet, DpGet, DpConnect
    }

    /**
     * Invokes custom handlers for WebSocket messages.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Incoming message.
     */
    invokeCustomHandlers(ws, msg) {
        for (const handler of this.handlers) {
            if (handler(ws, msg)) {
                return;
            }
        }
    }
}

module.exports = NGUI;