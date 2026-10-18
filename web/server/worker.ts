import { createApi } from './api';
import { SqlCatalogRepository } from './repository';

interface Env { DB: D1Database; SESSION_SECRET: string; ASSETS: Fetcher }
let api: ReturnType<typeof createApi> | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
    api ??= createApi(new SqlCatalogRepository({
      async get<T>(sql: string, params: unknown[] = []) { return env.DB.prepare(sql).bind(...params).first<T>(); },
      async all<T>(sql: string, params: unknown[] = []) { return (await env.DB.prepare(sql).bind(...params).all<T>()).results; },
    }), env.SESSION_SECRET);
    return api(request);
  },
};
