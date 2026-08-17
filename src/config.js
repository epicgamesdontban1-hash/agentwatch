'use strict';

/**
 * All configuration comes from the environment. There are no secrets or host-specific values baked
 * into the source - Render (or a local .env) supplies everything. See .env.example.
 */

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: intEnv('PORT', 3000),

  // A session with no heartbeat for this long is declared stale/offline.
  heartbeatTimeoutMs: intEnv('HEARTBEAT_TIMEOUT_MS', 45000),
  // How often we scan for stale sessions.
  staleSweepMs: intEnv('STALE_SWEEP_MS', 10000),
  // Fully-disconnected sessions are reaped after this long.
  removeAfterMs: intEnv('REMOVE_AFTER_MS', 600000),

  // Size guards so a single misbehaving client cannot exhaust memory.
  maxSessions: intEnv('MAX_SESSIONS', 500),
  maxPlayersPerSession: intEnv('MAX_PLAYERS_PER_SESSION', 2000),
  maxChatHistory: intEnv('MAX_CHAT_HISTORY', 200),
  maxChatLength: intEnv('MAX_CHAT_LENGTH', 512),

  // Optional shared secret. If set, mod clients must send a matching `token` in `register`.
  // Leave empty for an open deployment. The real value lives only in the environment.
  modToken: process.env.MOD_TOKEN || '',

  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: LOG_LEVELS[process.env.LOG_LEVEL] !== undefined ? process.env.LOG_LEVEL : 'info',
  clientVersion: '1.0.0',
};
