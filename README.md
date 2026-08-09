# Live Worship Projection (urban-proyecta)

A live projection system for churches/worship teams: an operator controls song lyrics, custom slides, and media from a dashboard, and one or more display screens (stage monitor, main screen) update in real time — no manual clicking through slides on the projector computer itself.

## The problem it solves

Traditional worship projection software runs one instance on one computer connected to the projector, operated locally. That's fragile (one machine, one operator, no remote control) and awkward when the person running slides isn't the person who should be near the projector. This project splits the two roles apart:

- An **operator dashboard** (song/service management, live control panel) that can run on any device — laptop, tablet, phone.
- One or more **display clients** (projector screen, stage monitor for singers) that just render whatever the operator broadcasts.
- A **real-time layer** (Socket.IO) keeps every connected display in sync with the operator's actions in well under a second, with room-based isolation so multiple independent services/campuses don't cross-talk.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Zustand — dashboard UI and display views.
- **Backend:** Node.js + Express + Socket.IO + Prisma — REST API for CRUD (songs, services, slide decks, media) and the WebSocket layer for live sync.
- **Database:** PostgreSQL — originally developed against NeonDB; **this public demo instead runs a real embedded Postgres server inside the backend process itself** (see "Database in this demo" below), so the whole thing is self-contained with zero external DB dependency.
- **Media storage:** Cloudinary.
- **Integrations:** Spotify Web API (client-credentials flow) to import playlists/setlists.

## Database in this demo

This public/portfolio deployment does **not** depend on any external or cloud database service (no Neon, no Supabase, nothing to provision or pay for). Instead, `backend/src/bootstrap.ts` runs on every server start, before the actual app:

1. Starts a real PostgreSQL server (`embedded-postgres` — an actual downloaded Postgres binary, not an emulator) inside the same long-running Node process, writing its data files to `backend/.pgdata-demo/`.
2. Points `DATABASE_URL` at that local instance and runs `prisma db push` to create the schema.
3. Runs the existing seed script (`backend/prisma/seed.ts`) to populate demo data (fictional songs, a sample Bible verse, one sample service — no real church content).
4. Only then starts the Express/Socket.IO app (`src/server.ts`), completely unmodified — it still just does `new PrismaClient()` and talks Postgres wire protocol like normal.

This works because the schema uses `provider = "postgresql"` and the generated Prisma Client emits Postgres-specific SQL — pointing it at SQLite instead wouldn't work without rewriting queries. An embedded *Postgres* keeps the exact same dialect while requiring no external service, container, or credentials to manage.

**Trade-off (intentional):** data does **not** persist across backend restarts. The `.pgdata-demo` directory is wiped and reseeded from scratch every time the process boots. This is fine here because:
- The backend is deployed to Render as a **persistent container** (a normal long-running Node process, not a serverless function), so the embedded Postgres data survives for the entire life of that container — it's not wiped between requests, only between restarts/redeploys.
- The demo is meant to be freely editable by visitors (create/edit songs, services, etc.) without any risk of someone corrupting or wiping out real data, because there is no real data — every restart hands back a clean, known-good demo state.

If you need the data to actually persist (e.g. adapting this for a real production deployment), set `USE_EMBEDDED_DB=false` and provide a real `DATABASE_URL` (Neon, Supabase, Railway Postgres, etc.) — `npm run start:server-only` / `npm run dev:server-only` skip the embedded-database bootstrap entirely and behave like the original setup.

## Architecture at a glance

```
operator dashboard  --REST (x-api-key)-->  Express API  --Prisma-->  PostgreSQL
       |                                        |
       '--------- Socket.IO (room + PIN) -------'
                                                 |
                                          display clients (stage/screen)
```

- Writes (create/update/delete songs, decks, media, room state) go through the REST API and require an `x-api-key` header matching the server's `API_KEY`. Reads are left open so the demo is browsable without credentials.
- Joining a room as an **operator** (the role that can actually drive the live show) requires a PIN that is validated server-side in the socket connection handler — the client can't just claim the role.
- The Next.js dashboard itself sits behind a login (`admin_token` cookie, checked in middleware) covering every `/dashboard/*` route, including the live control screen.
- Both the REST API and the external-service endpoints (Spotify import, PPTX export) are rate-limited, with a tighter limit on writes and an even tighter one on the endpoints that call out to third parties or generate files.

## Running it locally

Requires Node.js. **No external PostgreSQL install/account needed** — `npm run dev` boots an embedded Postgres automatically (see "Database in this demo" above) and reseeds it every time.

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in your own values, see below (DATABASE_URL can be left as-is/ignored)
npm run dev             # http://localhost:3001 — starts embedded Postgres, applies schema, seeds, then the server

# Frontend (in a second terminal)
cd frontend
npm install
cp .env.example .env.local   # fill in your own values, see below
npm run dev             # http://localhost:3000
```

### Environment variables

Both `backend/.env.example` and `frontend/.env.example` are documented inline with what each value is for and how to generate one. In short:

- **Backend** needs `DATABASE_URL`, an `OPERATOR_PIN` (the PIN operators use to join a room with write access over the socket), an `API_KEY` (the shared secret for REST writes), Cloudinary credentials, and optionally Spotify API credentials.
- **Frontend** needs a `DASHBOARD_PASSWORD` for the login page, matching `OPERATOR_PIN` and `NEXT_PUBLIC_API_KEY` values (must equal the backend's), and the backend's URL for both the Socket.IO and REST connections.

Generate your own values for all of the above — do not reuse any example/demo value you may see elsewhere. Nothing in this repo ships with real credentials; `.env*` files are gitignored.

## Deployment notes

- **Frontend → Vercel.** It's a standard Next.js app; Vercel is the natural fit.
- **Backend → Render or Railway, not Vercel.** The backend holds a persistent Socket.IO connection per connected client (operator + every display). Vercel's functions are request/response and don't keep a long-lived process around to hold those WebSocket connections open, so Socket.IO on Vercel would need to fall back to HTTP long-polling at best, and typically just doesn't stay connected reliably. Render/Railway run the Express+Socket.IO server as a normal long-running Node process, which is what persistent WebSockets need. (The server already has a `/health` endpoint intended for Render's health checks.) This same persistent-container model is also what makes the embedded-database approach viable — see "Database in this demo" above.

## License

For portfolio/demo purposes.
