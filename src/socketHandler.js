'use strict';

const validation = require('./validation');
const logger = require('./logger');

/**
 * WebSocket protocol for mod clients (path: /ws).
 *
 * Client -> server messages (all JSON, all optional except `register`):
 *   { type: "register",  sessionId, username, uuid, clientVersion, minecraftVersion, token }
 *   { type: "status",    status: "in-game" | "disconnected" }
 *   { type: "players",   players: [ { name, uuid, skinUrl } ] }
 *   { type: "chat",      text }
 *   { type: "event",     kind: "join" | "leave", player: { name, uuid, skinUrl } }
 *   { type: "heartbeat" }
 *
 * Server -> client:
 *   { type: "welcome", sessionId }
 *   { type: "pong" }
 *   { type: "error",   message }
 */

function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // socket already gone; close handler will clean up.
  }
}

function handleRegister(ws, meta, msg, store, config) {
  const sessionId = validation.validSessionId(msg.sessionId) ? msg.sessionId : null;
  if (!sessionId) return send(ws, { type: 'error', message: 'bad sessionId' });

  if (config.modToken && msg.token !== config.modToken) {
    return send(ws, { type: 'error', message: 'unauthorized' });
  }

  if (store.count() >= config.maxSessions && !store.get(sessionId)) {
    return send(ws, { type: 'error', message: 'server full' });
  }

  const data = {
    username: validation.str(msg.username, 32) || null,
    uuid: validation.validUuid(msg.uuid) ? msg.uuid : null,
    clientVersion: validation.str(msg.clientVersion, 32) || null,
    minecraftVersion: validation.str(msg.minecraftVersion, 32) || null,
  };

  store.register(sessionId, data);
  meta.sessionId = sessionId;
  meta.authed = true;
  send(ws, { type: 'welcome', sessionId });
  logger.debug(`register ${sessionId}${data.username ? ' (' + data.username + ')' : ''}`);
}

function handleStatus(ws, meta, msg, store) {
  if (!meta.sessionId) return;
  const status = msg.status === 'in-game' || msg.status === 'disconnected' ? msg.status : null;
  if (status) store.setStatus(meta.sessionId, status);
}

function handlePlayers(ws, meta, msg, store) {
  if (!meta.sessionId) return;
  store.setPlayers(meta.sessionId, validation.sanitizePlayers(msg.players));
}

function handleChat(ws, meta, msg, store, config) {
  if (!meta.sessionId) return;
  const text = validation.str(msg.text, config.maxChatLength);
  if (text) store.addChat(meta.sessionId, text);
}

function handleEvent(ws, meta, msg, store) {
  if (!meta.sessionId) return;
  const kind = msg.kind === 'join' || msg.kind === 'leave' ? msg.kind : null;
  if (!kind) return;
  const player = validation.sanitizePlayer(msg.player);
  if (player) store.addEvent(meta.sessionId, kind, player);
}

function handleHeartbeat(ws, meta, store) {
  if (!meta.sessionId) return;
  store.touch(meta.sessionId);
  send(ws, { type: 'pong' });
}

function attach(wss, store, config) {
  wss.on('connection', (ws) => {
    const meta = { sessionId: null, authed: false };

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', message: 'invalid json' });
      }

      if (!msg || typeof msg !== 'object') return;
      const type = typeof msg.type === 'string' ? msg.type : '';

      try {
        switch (type) {
          case 'register': handleRegister(ws, meta, msg, store, config); break;
          case 'status': handleStatus(ws, meta, msg, store); break;
          case 'players': handlePlayers(ws, meta, msg, store); break;
          case 'chat': handleChat(ws, meta, msg, store, config); break;
          case 'event': handleEvent(ws, meta, msg, store); break;
          case 'heartbeat': handleHeartbeat(ws, meta, store); break;
          default: break;
        }
      } catch (e) {
        logger.warn('message handling error:', e.message);
      }
    });

    ws.on('close', () => {
      if (meta.sessionId) {
        store.markDisconnected(meta.sessionId);
        logger.debug(`close ${meta.sessionId}`);
      }
    });

    ws.on('error', () => {
      // Errors are almost always followed by 'close'; nothing else to do.
    });
  });
}

module.exports = { attach };
