/**
 * Demo bootstrap: spins up a real embedded PostgreSQL server (WASM-free, an actual
 * Postgres binary via `embedded-postgres`) inside this same long-running process,
 * points DATABASE_URL at it, and only then starts the actual Express/Socket.IO app
 * (./server.ts).
 *
 * Why: this portfolio demo intentionally has ZERO external database dependency
 * (no Neon/Supabase/etc).
 *
 * Two modes:
 * - Pre-baked (production/Vercel): `src/prebake-db.ts` already ran once during
 *   `docker build` and left an initialized, schema-applied, seeded `.pgdata-demo/`
 *   baked into the image (marked by a `.prebaked` file inside it). Cold start just
 *   has to START that existing cluster — a few hundred ms — instead of running
 *   initdb + `prisma db push` + seed from scratch. This exists because the full
 *   from-scratch sequence took long enough that the FIRST request to a fresh
 *   Vercel container (cold start, e.g. after 5 minutes idle) failed with 500
 *   (INTERNAL_FUNCTION_INVOCATION_FAILED) before bootstrap finished.
 * - From-scratch (local dev, or any environment without a pre-baked dir): same
 *   behavior as before — wipe, initdb, push schema, seed. Nothing changes for
 *   local development.
 *
 * Nothing in src/server.ts, src/RoomManager.ts or src/socket.ts changes: they still
 * just do `new PrismaClient()` / `prisma.<model>.*` against DATABASE_URL exactly as
 * before. This file only has to run, and set that env var, before those modules are
 * first imported (hence the dynamic `await import('./server')` at the bottom).
 */
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const DATA_DIR = path.join(__dirname, '..', '.pgdata-demo');
const PG_PORT = Number(process.env.EMBEDDED_PG_PORT || 15433);
const PG_USER = 'urban';
const PG_PASSWORD = 'urban';
const PG_DATABASE = 'urban_proyecta';

function isPrebaked(): boolean {
  return fs.existsSync(path.join(DATA_DIR, '.prebaked'));
}

async function startEmbeddedPostgres(prebaked: boolean): Promise<string> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  if (!prebaked) {
    // Fresh state on every boot: if a previous run left data behind (e.g. the
    // container crashed instead of shutting down cleanly), wipe it so we never
    // start against a half-written or stale cluster.
    if (fs.existsSync(DATA_DIR)) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    }
  }

  // Postgres refuses to run its binaries as root. Render containers (like most
  // Docker images) run as root by default, so embedded-postgres needs permission
  // to create a dedicated system user to drop privileges to (`createPostgresUser`).
  // That codepath shells out to `groupadd`/`useradd`, which only exist on Linux —
  // on Windows (local dev) it must stay off, and it's also pointless when we're
  // not actually running as root.
  const isLinuxRoot = process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent: prebaked, // el .pgdata-demo horneado se queda tal cual entre stop() calls
    createPostgresUser: isLinuxRoot,
    onLog: (msg: string) => process.stdout.write(`[embedded-postgres] ${msg}\n`),
    onError: (err: unknown) => process.stderr.write(`[embedded-postgres] ${String(err)}\n`),
  });

  if (!prebaked) {
    console.log('[bootstrap] Initializing embedded PostgreSQL data directory...');
    await pg.initialise();
  }

  console.log('[bootstrap] Starting embedded PostgreSQL...');
  await pg.start();

  if (!prebaked) {
    console.log(`[bootstrap] Creating database "${PG_DATABASE}"...`);
    await pg.createDatabase(PG_DATABASE);
  }

  const shutdown = async () => {
    try {
      await pg.stop();
    } catch {
      /* best effort */
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DATABASE}`;
}

async function main() {
  const useEmbedded = process.env.USE_EMBEDDED_DB !== 'false';
  const prebaked = useEmbedded && isPrebaked();

  if (useEmbedded) {
    process.env.DATABASE_URL = await startEmbeddedPostgres(prebaked);
  } else {
    console.log('[bootstrap] USE_EMBEDDED_DB=false — using DATABASE_URL from environment as-is.');
  }

  if (prebaked) {
    console.log('[bootstrap] .pgdata-demo pre-horneada detectada — se salta db push y seed, ya estan aplicados.');
  } else {
    // Push the Prisma schema onto the fresh database (no migration history needed
    // for a demo that's rebuilt from scratch on every boot).
    // Note: these are fixed, hardcoded commands (no user/network input interpolated),
    // so running them via a shell string is safe — it just sidesteps a Windows-only
    // quirk where spawning "npx.cmd" directly (without a shell) fails with EINVAL.
    console.log('[bootstrap] Applying Prisma schema (db push)...');
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });

    // Reuse the existing seed script as-is (backend/prisma/seed.ts) — same fake
    // songs/verses/service used everywhere else in this sanitized demo.
    console.log('[bootstrap] Seeding demo data...');
    execSync('npx tsx prisma/seed.ts', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
  }

  console.log('[bootstrap] Starting application server...');
  await import('./server');
}

main().catch((err) => {
  console.error('[bootstrap] Fatal error during startup:', err);
  process.exit(1);
});
