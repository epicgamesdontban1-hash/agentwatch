'use strict';

/**
 * Input sanitisation for everything that arrives over the WebSocket. The mod clients are public
 * software, so we must assume messages can be malformed or hostile and never trust them.
 */

const UUID_RE =
  /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Keep printable text plus tab/newline/cr; drop everything else (control chars, nulls). */
function stripControl(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      out += ch;
    }
  }
  return out;
}

function str(value, max) {
  const cleaned = stripControl(value).trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

function validUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function validSessionId(value) {
  return typeof value === 'string' && SESSION_RE.test(value);
}

function validSkinUrl(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function sanitizePlayer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name, 32);
  if (!name) return null;
  return {
    name,
    uuid: validUuid(raw.uuid) ? raw.uuid : '',
    skinUrl: validSkinUrl(raw.skinUrl) || null,
  };
}

function sanitizePlayers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    const clean = sanitizePlayer(p);
    if (clean) out.push(clean);
    if (out.length >= 5000) break; // hard ceiling before store capping
  }
  return out;
}

module.exports = {
  str,
  validUuid,
  validSessionId,
  validSkinUrl,
  sanitizePlayer,
  sanitizePlayers,
};
