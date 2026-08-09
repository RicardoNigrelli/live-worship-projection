/**
 * Corre UNA VEZ, durante `docker build` (no en runtime): inicializa el
 * cluster embebido de Postgres, aplica el schema de Prisma, y siembra los
 * datos de demo — todo esto queda guardado en `.pgdata-demo/` y esa carpeta
 * se copia tal cual dentro de la imagen final.
 *
 * Por que: bootstrap.ts hacia este mismo trabajo en cada arranque del
 * contenedor (initdb + prisma db push + seed), y esa secuencia completa
 * tarda varios segundos. En Vercel, la primera request a un contenedor
 * recien arrancado (cold start, ej. despues de 5 minutos sin trafico) se
 * caia con 500 (INTERNAL_FUNCTION_INVOCATION_FAILED) porque el bootstrap
 * todavia no habia terminado. Horneando la base ya lista en el build, el
 * arranque en runtime solo tiene que PRENDER un Postgres que ya existe
 * (rapido, unos cientos de ms) en vez de crearlo de cero.
 *
 * El shutdown al final tiene que ser limpio (pg.stop(), no matar el
 * proceso) para que Postgres no arranque en modo de recuperacion de crash
 * la proxima vez.
 */
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const DATA_DIR = path.join(__dirname, '..', '.pgdata-demo');
const PG_PORT = 15433;
const PG_USER = 'urban';
const PG_PASSWORD = 'urban';
const PG_DATABASE = 'urban_proyecta';

async function main() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const isLinuxRoot =
    process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent: true, // esta vez SI queremos que los archivos queden en disco
    createPostgresUser: isLinuxRoot,
    onLog: (msg: string) => process.stdout.write(`[prebake] ${msg}\n`),
    onError: (err: unknown) => process.stderr.write(`[prebake] ${String(err)}\n`),
  });

  console.log('[prebake] Inicializando cluster Postgres...');
  await pg.initialise();

  console.log('[prebake] Arrancando Postgres...');
  await pg.start();

  console.log(`[prebake] Creando base "${PG_DATABASE}"...`);
  await pg.createDatabase(PG_DATABASE);

  const databaseUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DATABASE}`;

  console.log('[prebake] Aplicando schema de Prisma...');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('[prebake] Sembrando datos de demo...');
  execSync('npx tsx prisma/seed.ts', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('[prebake] Apagando Postgres de forma limpia...');
  await pg.stop();

  // Marca para que bootstrap.ts en runtime sepa que esta carpeta ya esta lista
  // y no tiene que volver a inicializar/sembrar nada.
  fs.writeFileSync(path.join(DATA_DIR, '.prebaked'), new Date().toISOString());

  console.log('[prebake] Listo — .pgdata-demo pre-horneada y lista para copiarse a la imagen.');
}

main().catch((err) => {
  console.error('[prebake] Error fatal:', err);
  process.exit(1);
});
