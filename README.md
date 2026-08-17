# AgentWatch Backend

A small, dependency-light Node.js service that receives live session state from
**AgentWatch** mod clients and exposes it over REST (and a WebSocket control channel) so a
website/dashboard can display every current user of the mod.

```
Minecraft Client Mod  ──WebSocket(/ws)──▶  AgentWatch Backend  ──REST(/api/*)──▶  Website / Dashboard
```

This folder is fully independent of the client mod build. It can be committed to GitHub and deployed
to Render on its own.

---

## Features

- Accepts WebSocket connections from mod clients and tracks **each session separately** (a session =
  one running instance of the mod, keyed by a client-generated `sessionId`).
- Stores, per session: Minecraft username, UUID, online/offline + connection status, last-seen
  timestamp, the current online-player list (with skin URLs), received local chat, and join/leave
  events.
- Heartbeat / ping handling: a session that stops sending heartbeats is automatically marked
  `disconnected`/`offline`; fully-dead sessions are reaped after a configurable grace period.
- Supports **many concurrent mod users** at once — five players running the mod = five active
  sessions, all exposed through the API.
- REST endpoints the website can poll for users, sessions, players, status and chat.
- Input validation + size caps on every field, so a malformed or hostile client cannot crash or
  exhaust the service.
- Secrets live in the environment, never in source.

---

## Project structure

```
backend/
├── package.json          # deps (express, ws) + start scripts
├── render.yaml           # one-click Render Blueprint
├── .env.example          # copy to .env for local dev (gitignored)
├── .gitignore
├── public/
│   └── index.html        # tiny built-in viewer at "/" (optional; the real site can be anything)
├── src/
│   ├── index.js          # entry point: HTTP server + WS + API + stale sweep
│   ├── config.js         # environment-driven configuration
│   ├── logger.js         # leveled console logger
│   ├── validation.js     # sanitisation of all inbound data
│   ├── sessionStore.js   # in-memory active-session storage + stale detection
│   ├── socketHandler.js  # WebSocket protocol for mod clients
│   └── api.js            # REST endpoints for the website
└── README.md
```

---

## Run locally

Requires **Node.js 18+**.

```bash
cd backend
npm install

# optional: configure behaviour
cp .env.example .env
# edit .env as needed

npm start
# or, with auto-restart on change:
npm run dev
```

The server listens on `http://localhost:3000` (override with `PORT`). Open
`http://localhost:3000/` for the built-in viewer, or hit the API directly:

```bash
curl http://localhost:3000/api/state
curl http://localhost:3000/api/health
```

---

## Deploy to Render

1. Push this `backend/` folder to a GitHub repo (or a repo that contains it).
2. In Render, create a new **Blueprint** and select the repo, **or** create a **Web Service**
   manually:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free (or any)
   - **Health check path:** `/api/health`
3. (Optional) Add a `MOD_TOKEN` environment variable. If set, mod clients must send a matching
   `token` in their `register` message; leave it unset for open access.
4. Set `CORS_ORIGIN` to `*` (open) or to your website's origin to lock the API down.

The included `render.yaml` encodes all of this — selecting "Blueprint" and pointing at the repo is the
fastest path. Render assigns the public URL (e.g. `https://agentwatch.onrender.com`) automatically.

> The mod clients connect to the WebSocket at `<your-host>/ws` (e.g.
> `wss://agentwatch.onrender.com/ws`). If you deploy under a different host, update the
> `WS_URL` constant in the client's `BackendLink` class and rebuild the mod.

---

## WebSocket protocol (mod client → backend)

Connect to `wss://<host>/ws`. All messages are JSON.

**Client → server**

| type        | fields                                                        | meaning                                  |
|-------------|---------------------------------------------------------------|------------------------------------------|
| `register`  | `sessionId`, `username`, `uuid`, `clientVersion`, `minecraftVersion`, `token` | identify this session (token optional) |
| `status`    | `status`: `"in-game"` \| `"disconnected"`                     | the local player's connection state      |
| `players`   | `players`: `[ { name, uuid, skinUrl } ]`                     | current online-player list               |
| `chat`      | `text`                                                        | a local player chat line                 |
| `event`     | `kind`: `"join"` \| `"leave"`, `player`: `{ name, uuid, skinUrl }` | a player joined/left the server      |
| `heartbeat` | –                                                             | keep-alive (expect a `pong` back)        |

**Server → client**

| type      | fields              | meaning                              |
|-----------|---------------------|--------------------------------------|
| `welcome` | `sessionId`         | registration accepted                |
| `pong`    | –                   | heartbeat acknowledgement             |
| `error`   | `message`           | rejected message (bad sessionId, unauthorized, …) |

If the socket drops, the client reconnects with back-off; the same `sessionId` merges the new socket
into the existing session.

---

## REST API (website → backend)

| method | path                  | description                                                  |
|--------|-----------------------|--------------------------------------------------------------|
| GET    | `/api/health`         | liveness probe (`{ ok: true }`)                             |
| GET    | `/api/state`          | full snapshot: counts + every session + aggregated players  |
| GET    | `/api/sessions`       | all sessions                                                 |
| GET    | `/api/sessions/:id`   | one session by `sessionId`                                   |
| GET    | `/api/users`          | distinct users currently using the mod (grouped by uuid/name)|
| GET    | `/api/players`        | players seen across all in-game sessions, de-duplicated      |
| GET    | `/`                   | small built-in viewer                                        |

All responses are JSON and CORS-enabled (controlled by `CORS_ORIGIN`). Example:

```bash
curl https://your-host.onrender.com/api/state | jq '.counts'
```

---

## Configuration (environment variables)

See `.env.example`. Important ones:

- `PORT` / `HOST` — listen address (Render sets `PORT`).
- `HEARTBEAT_TIMEOUT_MS` — stale-after-no-heartbeat window (default `45000`).
- `STALE_SWEEP_MS` — how often to scan for stale sessions (default `10000`).
- `REMOVE_AFTER_MS` — reap fully-disconnected sessions after this long (default `600000`).
- `MAX_SESSIONS`, `MAX_PLAYERS_PER_SESSION`, `MAX_CHAT_HISTORY`, `MAX_CHAT_LENGTH` — size guards.
- `MOD_TOKEN` — optional shared secret (clients must match it).
- `CORS_ORIGIN` — allowed origin for the website (`*`, or a specific origin).
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`.

---

## Notes on privacy & secrets

- No API keys or host-specific values are committed. Everything sensitive is supplied via environment
  variables (local `.env`, or Render's dashboard).
- The optional `MOD_TOKEN` is enforced only if you set it; the default open deployment needs none.
- Inbound data is validated and size-capped; player/chat content is treated as untrusted.
- The built-in viewer renders names and chat with `textContent` (never `innerHTML`) to avoid XSS, and
  only loads skin images from `https://textures.minecraft.net` or `https://mc-heads.net`.
