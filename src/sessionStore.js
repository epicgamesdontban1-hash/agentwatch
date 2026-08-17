'use strict';

/**
 * In-memory store of every active mod session.
 *
 * A "session" is one running instance of the mod (identified by the client-generated sessionId). It
 * is deliberately separate from a "user": the same player launching the mod twice, or on two machines,
 * produces two sessions that the website can aggregate back into one user.
 *
 * The store is intentionally simple - a single Map. For a free-tier Render instance with a few
 * hundred concurrent mod users this is more than enough, and it avoids any external dependency.
 */

function nowIso() {
  return new Date().toISOString();
}

class SessionStore {
  constructor(config) {
    this.config = config;
    /** @type {Map<string, object>} */
    this.sessions = new Map();
  }

  count() {
    return this.sessions.size;
  }

  all() {
    return Array.from(this.sessions.values());
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /** Create a session on first register, or refresh identity on later registers of the same id. */
  register(sessionId, data) {
    const existing = this.sessions.get(sessionId);
    const now = nowIso();

    if (existing) {
      existing.username = data.username || existing.username;
      existing.uuid = data.uuid || existing.uuid;
      existing.clientVersion = data.clientVersion || existing.clientVersion;
      existing.minecraftVersion = data.minecraftVersion || existing.minecraftVersion;
      existing.connected = true;
      existing.lastSeen = now;
      existing.lastHeartbeat = now;
      return existing;
    }

    const session = {
      sessionId,
      username: data.username || null,
      uuid: data.uuid || null,
      status: 'connecting',
      online: false, // in-game yet?
      connected: true, // websocket open?
      usingMod: true,
      clientVersion: data.clientVersion || null,
      minecraftVersion: data.minecraftVersion || null,
      firstSeen: now,
      lastSeen: now,
      lastHeartbeat: now,
      lastDisconnected: 0,
      players: [],
      chat: [],
      events: [],
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  touch(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.lastHeartbeat = nowIso();
      s.connected = true;
    }
    return s;
  }

  setStatus(sessionId, status) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    s.status = status;
    s.online = status === 'in-game';
    s.lastSeen = nowIso();
    if (status === 'disconnected') {
      s.connected = false;
      s.lastDisconnected = Date.now();
      s.players = [];
    }
    return s;
  }

  setPlayers(sessionId, players) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    s.players = players.slice(0, this.config.maxPlayersPerSession);
    s.lastSeen = nowIso();
    return s;
  }

  addChat(sessionId, text) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    s.chat.push({ text, ts: Date.now() });
    if (s.chat.length > this.config.maxChatHistory) s.chat.shift();
    s.lastSeen = nowIso();
    return s;
  }

  addEvent(sessionId, kind, player) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    s.events.push({ kind, player, ts: Date.now() });
    if (s.events.length > 100) s.events.shift();
    return s;
  }

  markDisconnected(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    // The socket is gone, so we can no longer trust the last reported game state - treat the player
    // as offline right away. The stale sweep will later reap the session entirely.
    s.connected = false;
    s.online = false;
    s.status = 'disconnected';
    s.players = [];
    s.lastDisconnected = Date.now();
    s.lastSeen = nowIso();
  }

  /** Declare stale sessions offline and reap the long-dead ones. Called on a timer. */
  sweep() {
    const now = Date.now();
    const staleMs = this.config.heartbeatTimeoutMs;

    for (const [id, s] of this.sessions) {
      if (s.connected && now - Date.parse(s.lastHeartbeat) > staleMs) {
        s.connected = false;
        s.online = false;
        s.status = 'disconnected';
        s.players = [];
        s.lastDisconnected = now;
        s.lastSeen = nowIso();
      }

      if (!s.connected && now - s.lastDisconnected > this.config.removeAfterMs) {
        this.sessions.delete(id);
      }
    }
  }
}

module.exports = (config) => new SessionStore(config);
