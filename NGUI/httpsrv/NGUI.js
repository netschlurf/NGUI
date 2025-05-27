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
        this.commandMap = {
            'LoadPage': this.serveResource.bind(this),
            'LoadResource': this.serveResource.bind(this),
            'Reconnect': this.handleReconnect.bind(this),
            'RegisterCommands': this.registerRemoteHandler.bind(this), // New: Register remote handler
        };
        // Map for sessions: ws instance -> { sessionData, timeout }
        this.sessions = new Map();
        // Map for remote handlers: ws instance -> { commands: string[] }
        this.remoteHandlers = new Map();
    }

    /**
     * Registers a local handler for incoming WebSocket messages.
     * @param {function} handler - Callback function for message processing.
     */
    registerHandler(handler) {
        this.handlers.push(handler);
    }

    /**
     * Registers a remote handler with its supported command set.
     * @param {Object} msg - Message containing commands array in args.
     * @param {WebSocket} ws - WebSocket instance of the remote handler.
     */
    registerRemoteHandler(msg, ws) {
        if (!msg.args || !Array.isArray(msg.args.commands)) {
            this.sendResponse(ws, msg, '', '400: Missing or invalid commands array');
            return;
        }

        this.remoteHandlers.set(ws, { commands: msg.args.commands });
        console.log(`Registered remote handler with commands: ${msg.args.commands.join(', ')}`);

        this.sendResponse(ws, msg, { status: 'Commands registered', rc: 200 });
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

        // Create new session
        const sessionData = {
            userInfo: { userId: null },
            dpConnects: {},
            createdAt: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
            reconnectToken: this.generateReconnectToken(),
        };
        this.sessions.set(ws, { sessionData, timeout: null, ws: ws });

        // Send reconnectToken to client
        this.sendResponse(ws, { tok: 'init' }, { reconnectToken: sessionData.reconnectToken });

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

        if(msg.data && msg.data.originalWsId)
        {
            var foundSession = null;

            for (const [ws, session] of this.sessions.entries()) {
                if(session.ws.originalWsId === msg.data.originalWsId) {
                foundSession = session;
                break;
                }
            }
            if (foundSession) {
                this.sendResponse(foundSession.ws, msg, msg.data);
            }
            return;
        }
        if (!msg || !msg.cmd) {
            return;
        }

        // Update userInfo if provided
        const session = this.sessions.get(ws);
        if (session && msg.userId) {
            session.sessionData.userInfo.userId = msg.userId;
            console.log(`Session updated for ws: userId=${msg.userId}`);
        }

        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return;
        } else {
            this.invokeCustomHandlers(ws, msg);
        }
    }

    /**
     * Handles WebSocket close event, keeping session for 30 seconds.
     * @param {WebSocket} ws - WebSocket instance.
     */
    handleWebSocketClose(ws) {
        const session = this.sessions.get(ws);

        for (const handler of this.handlers) {
            handler.OnWebsocketClosed(ws);
        }
        if (!session) {
            console.error('Session not found on close');
            return;
        }

        console.log(`WebSocket closed for session (userId: ${session.sessionData.userInfo.userId || 'unknown'})`);

        // Remove from remote handlers
        this.remoteHandlers.delete(ws);

        // Start 30-second timeout for session destruction
        session.timeout = setTimeout(() => {
            console.log(`Destroying session for userId: ${session.sessionData.userInfo.userId || 'unknown'}`);
            this.sessions.delete(ws);
        }, 30 * 1000);
        session.ws = ws;
        this.sessions.set(ws, session);
    }

    /**
     * Handles reconnect attempts.
     * @param {Object} msg - Incoming message with reconnectToken.
     * @param {WebSocket} ws - New WebSocket instance.
     */
    handleReconnect(msg, ws) {
        if (!msg.args || !msg.args.reconnectToken) {
            this.sendResponse(ws, msg, '', '400: Missing reconnectToken');
            return;
        }

        const reconnectToken = msg.args.reconnectToken;
        let oldWs = null;

        // Search for session with matching reconnectToken
        for (const [key, session] of this.sessions.entries()) {
            if (session.sessionData.reconnectToken === reconnectToken) {
                oldWs = key;
                break;
            }
        }

        if (oldWs) {
            const session = this.sessions.get(oldWs);
            console.log(`Reconnecting session for userId: ${session.sessionData.userInfo.userId || 'unknown'}`);

            // Take over old session
            clearTimeout(session.timeout);
            this.sessions.delete(oldWs);
            this.sessions.set(ws, { sessionData: session.sessionData, timeout: null, ws: ws });
            this.sendResponse(ws, msg, { status: 'Reconnected', userInfo: session.sessionData.userInfo });
        } else {
            this.sendResponse(ws, msg, '', '404: Session not found');
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
        this.sessions.forEach((session) => clearTimeout(session.timeout));
        this.sessions.clear();
        this.remoteHandlers.clear();
    }

    /**
     * Sends a response over WebSocket.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Original message.
     * @param {Object} data - Response data.
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
        const paths = [];
        var myRoot = __dirname.replace("httpsrv", "htdocs");
        paths.push(path.join(myRoot, filePath));

        for (const handler of this.handlers) {
            const customPath = await handler.GetHtdocsRoot();
            if (customPath) {
                paths.push(path.join(customPath, filePath));
            }
        }
        let foundPath = "";
        for (const fullPath of paths) {
            try {
                await fs.access(fullPath);
                foundPath = fullPath;
            } catch (err) {
                continue;
            }
        }
        return foundPath;
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
     * Invokes custom handlers for WebSocket messages, including remote handlers.
     * @param {WebSocket} ws - WebSocket instance of the client.
     * @param {Object} msg - Incoming message.
     */
    invokeCustomHandlers(ws, msg) {
        // Try local handlers first
        for (const handler of this.handlers) {
            if (handler.OnHandle(ws, msg)) {
                return;
            }
        }
        var bFound = false;
        // Try remote handlers
        for (const [remoteWs, handler] of this.remoteHandlers.entries()) {
            if (handler.commands.includes(msg.cmd)) {
                // Forward the message to the remote handler
                const forwardedMsg = {
                    ...msg,
                    originalWsId: ws._id || Math.random().toString(36).substr(2), // Unique ID for original ws
                };
                ws.originalWsId = forwardedMsg.originalWsId;
                remoteWs.send(JSON.stringify(forwardedMsg));
                bFound = true;
                break;
            }
        }
        if(!bFound) {
            console.warn(`No handler found for command: ${msg.cmd}`);
            this.sendResponse(ws, msg, '', '404: Command not found');
        }
    }

    /**
     * Generates a simple reconnect token (for demo purposes).
     * @returns {string} - Reconnect token.
     */
    generateReconnectToken() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
}

module.exports = NGUI;