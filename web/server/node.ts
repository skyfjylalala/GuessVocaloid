import { createServer } from 'node:http';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApi } from './api';
import { SqlCatalogRepository } from './repository';

// A runnable non-Cloudflare host. Uses the same schema, repository and API as the Worker.
mkdirSync('.local', { recursive: true });
const db = new DatabaseSync(process.env.DATABASE_PATH ?? '.local/catalog.sqlite');
db.exec(readFileSync('migrations/0001_catalog.sql', 'utf8'));
if (!db.prepare('SELECT value FROM catalog_meta WHERE key = ?').get('version')) {
  db.exec('BEGIN');
  try { db.exec(readFileSync('data/seed.sql', 'utf8')); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
}
const repository = new SqlCatalogRepository({
  async get<T>(sql: string, params: unknown[] = []) { return (db.prepare(sql).get(...params as SQLInputValue[]) as T | undefined) ?? null; },
  async all<T>(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params as SQLInputValue[]) as T[]; },
});
const api = createApi(repository, process.env.SESSION_SECRET ?? randomBytes(32).toString('hex'));
const root = resolve('dist/client');
const mime: Record<string,string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host ?? 'localhost';
    const url = new URL(incoming.url ?? '/', process.env.PUBLIC_ORIGIN ?? `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 4096) { outgoing.writeHead(413); outgoing.end(); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const method = incoming.method ?? 'GET';
      const response = await api(new Request(url, { method, headers, ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}) }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(incoming.method ?? 'GET')) { outgoing.writeHead(405); outgoing.end(); return; }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) { outgoing.writeHead(403); outgoing.end(); return; }
    if (file === root || !existsSync(file)) file = resolve(root, 'index.html');
    outgoing.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    outgoing.end(incoming.method === 'HEAD' ? undefined : readFileSync(file));
  } catch { outgoing.writeHead(500); outgoing.end('Server error'); }
});
const port = Number(process.env.PORT ?? 4180);
const bindHost = process.env.HOST ?? '127.0.0.1';
server.listen(port, bindHost, () => console.log(`Guess Vocaloid Node + SQLite: http://${bindHost}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
