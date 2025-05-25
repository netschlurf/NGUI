const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

/**
 * Base class for server modules that handle HTTP and WebSocket communication.
 * Provides common functionality for serving static files, handling WebSocket messages,
 * and connecting to a remote NGUI server with reconnection logic.
 * Designed to be extended by specialized modules (e.g., archive, SNMP).
 */
class IME_ServiceBase {
    /**
     * Initializes the module with a port and configuration.
     * @param {number} port - Port for HTTP and WebSocket server.
     * @param {Object} config - Configuration object (e.g., NGUI URL, reconnect settings).
     */
    constructor(port, config = {}) {
        this.port = port;
        this.config = {
            nguiUrl: config.nguiUrl || 'ws://localhost:2808',
            maxReconnectDelay: config.maxReconnectDelay || 30000, // 30 seconds
            ...config
        };
        this.server = null;
        this.wss = null;
        this.handlers = [];
        this.commandMap = {
            'LoadPage': this.serveResource.bind(this),
            'LoadResource': this.serveResource.bind(this),
        };
        this.nguiWs = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
    }

    /**
     * Registers a handler for incoming WebSocket messages.
     * @param {Object} handler - Handler with OnHandle and optional OnWebsocketClosed methods.
     */
    registerHandler(handler) {
        if (typeof handler.OnHandle !== 'function') {
            throw new Error('Handler must implement OnHandle method');
        }
        this.handlers.push(handler);
    }

    /**
     * Starts the HTTP and WebSocket server and initializes the module.
     * Subclasses should override initializeModule to set up specific resources.
     */
    async start() {
        this.server = http.createServer(this.handleHttpRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', this.handleWebSocketConnection.bind(this));
        this.server.listen(this.port, () => {
            console.log(`Module server running on port ${this.port}`);
        });

        await this.initializeModule();
        await this.connectToNGUI();
    }

    /**
     * Initializes module-specific resources (e.g., database, SNMP client).
     * Must be implemented by subclasses.
     * @abstract
     * @throws {Error} If not implemented.
     */
    async initializeModule() {
        throw new Error('initializeModule must be implemented by subclass');
    }

    /**
     * Connects to the NGUI server and sets up communication.
     * Subclasses can override setupNGUIConnection to customize NGUI interaction.
     */
    async connectToNGUI() {
        if (this.isConnecting) return;
        try {
            this.isConnecting = true;
            const reconnectDelay = Math.min(
                5000 * Math.pow(2, this.reconnectAttempts), // Exponential backoff
                this.config.maxReconnectDelay
            );

            if (this.reconnectAttempts > 0) {
                console.log(`Attempting to reconnect to NGUI in ${reconnectDelay / 1000} seconds (attempt ${this.reconnectAttempts + 1})`);
                await new Promise(resolve => setTimeout(resolve, reconnectDelay));
            }

            this.nguiWs = new WebSocket(this.config.nguiUrl);
            this.isConnecting = false;

            this.nguiWs.on('open', async () => {
                console.log('Connected to NGUI server');
                this.reconnectAttempts = 0;
                try {
                    await this.setupNGUIConnection(this.nguiWs);
                } catch (err) {
                    console.error('Error setting up NGUI connection:', err);
                    this.handleNGUIReconnect();
                }
            });

            this.nguiWs.on('message', (message) => this.handleNGUIMessage(message));
            this.nguiWs.on('error', (err) => {
                console.error('NGUI WebSocket error:', err);
                this.handleNGUIReconnect();
            });
            this.nguiWs.on('close', () => {
                console.log('Disconnected from NGUI server');
                this.handleNGUIReconnect();
            });

        } catch (err) {
            console.error('Failed to connect to NGUI:', err);
            this.isConnecting = false;
            this.handleNGUIReconnect();
        }
    }

    /**
     * Sets up NGUI connection (e.g., register commands, retrieve data).
     * Subclasses should override to implement specific NGUI interactions.
     * @abstract
     * @param {WebSocket} ws - NGUI WebSocket instance.
     */
    async setupNGUIConnection(ws) {
        // Default: No commands registered
        console.log('No NGUI commands registered (override setupNGUIConnection to customize)');
    }

    /**
     * Handles incoming NGUI messages.
     * Subclasses should override to process specific messages.
     * @param {Buffer} message - Incoming message.
     */
    handleNGUIMessage(message) {
        try {
            const msg = JSON.parse(message);
            if (msg.cmd && this.commandMap[msg.cmd]) {
                this.commandMap[msg.cmd](msg, this.nguiWs);
            }
        } catch (err) {
            console.error('Error processing NGUI message:', err);
        }
    }

    /**
     * Handles reconnection to NGUI server.
     */
    handleNGUIReconnect() {
        if (this.nguiWs) {
            this.nguiWs.removeAllListeners();
            this.nguiWs = null;
        }
        this.reconnectAttempts++;
        this.connectToNGUI();
    }

    /**
     * Sends a request to NGUI and awaits response.
     * @param {WebSocket} ws - NGUI WebSocket instance.
     * @param {Object} msg - Message to send (must include tok).
     * @returns {Promise<Object>} Response data.
     */
    requestNGUI(ws, msg) {
        return new Promise((resolve, reject) => {
            ws.send(JSON.stringify(msg));
            const handler = (message) => {
                try {
                    const response = JSON.parse(message);
                    if (response.tok === msg.tok) {
                        ws.off('message', handler);
                        if (response.err) {
                            reject(new Error(response.err));
                        } else {
                            resolve(response.data);
                        }
                    }
                } catch (err) {
                    reject(err);
                }
            };
            ws.on('message', handler);
            setTimeout(() => {
                ws.off('message', handler);
                reject(new Error('Request to NGUI timed out'));
            }, 5000); // 5-second timeout
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
        ws.on('close', () => this.handleWebSocketClose(ws));
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

        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return;
        } else {
            this.invokeCustomHandlers(ws, msg);
        }
    }

    /**
     * Handles WebSocket close event.
     * @param {WebSocket} ws - WebSocket instance.
     */
    handleWebSocketClose(ws) {
        console.log('WebSocket closed');
        for (const handler of this.handlers) {
            if (typeof handler.OnWebsocketClosed === 'function') {
                handler.OnWebsocketClosed(ws);
            }
        }
    }

    /**
     * Closes the HTTP and WebSocket server and cleans up resources.
     * Subclasses should override cleanupModule to release specific resources.
     */
    close() {
        if (this.wss) {
            this.wss.close(() => console.log('WebSocket server closed'));
        }
        if (this.server) {
            this.server.close(() => console.log('HTTP server closed'));
        }
        if (this.nguiWs) {
            this.nguiWs.close();
            this.nguiWs = null;
        }
        this.cleanupModule();
    }

    /**
     * Cleans up module-specific resources (e.g., database connections).
     * Subclasses should override to implement specific cleanup.
     * @abstract
     */
    cleanupModule() {
        // Default: No cleanup
    }

    /**
     * Sends a response over WebSocket.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Original message.
     * @param {any} data - Response data.
     * @param {string} [err] - Error message, if any.
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
     * @param {Object} msg - Incoming message with fileName in args.
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
     * Resolves a file path for serving resources.
     * @param {string} filePath - Relative file path.
     * @returns {Promise<string|null>} Resolved full path or null if not found.
     */
    async resolveFilePath(filePath) {
        const paths = [];
        const myRoot = __dirname.replace('httpsrv', 'htdocs');
        paths.push(path.join(myRoot, filePath));

        for (const handler of this.handlers) {
            if (typeof handler.GetHtdocsRoot === 'function') {
                const customPath = await handler.GetHtdocsRoot();
                if (customPath) {
                    paths.push(path.join(customPath, filePath));
                }
            }
        }

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
     * @returns {string} Content-Type.
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
     * Invokes custom handlers for WebSocket messages.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Incoming message.
     */
    invokeCustomHandlers(ws, msg) {
        for (const handler of this.handlers) {
            if (handler.OnHandle(ws, msg)) {
                return;
            }
        }
    }
}

module.exports = IME_ServiceBase;