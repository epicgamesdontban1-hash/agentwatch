'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const config = require('./config');
const logger = require('./logger');
const createSessionStore = require('./sessionStore');
const { createApi } = require('./api');
const socketHandler = require('./socketHandler');

const store = createSessionStore(config);
const app = createApi(store, config);
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
socketHandler.attach(wss, store, config);

// Periodically mark stale sessions offline and reap the long-dead ones.
setInterval(() => {
  try {
    store.sweep();
  } catch (e) {
    logger.warn('sweep failed:', e.message);
  }
}, config.staleSweepMs);

server.listen(config.port, config.host, () => {
  logger.info(`AgentWatch backend listening on ${config.host}:${config.port} (ws path /ws)`);
});

function shutdown() {
  logger.info('shutting down');
  try {
    wss.close();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  // Don't hang forever if a socket refuses to close.
  const t = setTimeout(() => process.exit(0), 3000);
  if (t.unref) t.unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
