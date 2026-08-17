'use strict';

const path = require('path');
const express = require('express');
const logger = require('./logger');

/**
 * REST API consumed by the website (or any dashboard).
 *
 * Endpoints:
 *   GET /api/health          liveness probe (used by Render's health check)
 *   GET /api/state           full snapshot: counts + every session + aggregated players
 *   GET /api/sessions        all sessions
 *   GET /api/sessions/:id    one session
 *   GET /api/users           distinct users (grouped by uuid/username) currently using the mod
 *   GET /api/players         players seen across all in-game sessions, de-duplicated
 *   GET /                     a small built-in viewer (optional; the real site can be anything)
 */

function publicSession(s) {
  return {
    sessionId: s.sessionId,
    username: s.username,
    uuid: s.uuid,
    status: s.status,
    online: s.online,
    connected: s.connected,
    usingMod: s.usingMod,
    clientVersion: s.clientVersion,
    minecraftVersion: s.minecraftVersion,
    firstSeen: s.firstSeen,
    lastSeen: s.lastSeen,
    players: s.players,
    chat: s.chat,
    events: s.events,
  };
}

function buildState(store) {
  const sessions = store.all().map(publicSession);
  const inGame = sessions.filter((s) => s.status === 'in-game' && s.connected).length;
  const usingMod = sessions.filter((s) => s.usingMod).length;

  // De-duplicate players across sessions by uuid (fall back to name).
  const playerMap = new Map();
  for (const s of sessions) {
    if (!s.online) continue;
    for (const p of s.players) {
      playerMap.set(p.uuid || p.name, p);
    }
  }

  return {
    serverTime: Date.now(),
    counts: {
      sessions: sessions.length,
      inGame,
      usingMod,
      players: playerMap.size,
    },
    sessions,
    players: Array.from(playerMap.values()),
  };
}

function buildUsers(store) {
  const byUser = new Map();

  for (const s of store.all()) {
    const key = s.uuid || s.username || s.sessionId;
    if (!key) continue;

    let agg = byUser.get(key);
    if (!agg) {
      agg = {
        username: s.username,
        uuid: s.uuid,
        sessions: 0,
        online: false,
        lastSeen: s.lastSeen,
        usingMod: s.usingMod,
      };
      byUser.set(key, agg);
    }

    agg.sessions += 1;
    agg.online = agg.online || s.online;
    if (Date.parse(s.lastSeen) > Date.parse(agg.lastSeen)) agg.lastSeen = s.lastSeen;
  }

  return Array.from(byUser.values()).sort(
    (a, b) => (Number(b.online) - Number(a.online)) || (a.username || '').localeCompare(b.username || '')
  );
}

function createApi(store, config) {
  const app = express();

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  app.get('/api/state', (req, res) => res.json(buildState(store)));

  app.get('/api/sessions', (req, res) => {
    const list = store.all().map(publicSession);
    res.json({ count: list.length, sessions: list });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const s = store.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(publicSession(s));
  });

  app.get('/api/users', (req, res) => res.json({ users: buildUsers(store) }));

  app.get('/api/players', (req, res) => {
    const state = buildState(store);
    res.json({ players: state.players, count: state.players.length });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Catch-all so unknown routes return JSON, not an HTML stack.
  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  logger.debug('API routes registered');
  return app;
}

module.exports = { createApi };
