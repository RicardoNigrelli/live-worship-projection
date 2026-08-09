// `embedded-postgres` ships as an ESM-only package with an `exports` map that our
// project's CommonJS-oriented moduleResolution ("node10"/classic) can't statically
// resolve, even though the dynamic `await import('embedded-postgres')` call in
// bootstrap.ts works fine at runtime (Node's native dynamic import handles it).
// This ambient declaration just gives TypeScript something to type-check against
// without needing to flip the whole project's moduleResolution mode.
declare module 'embedded-postgres' {
  interface PostgresOptions {
    databaseDir?: string;
    port?: number;
    user?: string;
    password?: string;
    authMethod?: 'scram-sha-256' | 'password' | 'md5';
    persistent?: boolean;
    initdbFlags?: string[];
    postgresFlags?: string[];
    createPostgresUser?: boolean;
    onLog?: (message: string) => void;
    onError?: (messageOrError: string | Error | unknown) => void;
  }

  class EmbeddedPostgres {
    constructor(options?: PostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
  }

  export default EmbeddedPostgres;
}
