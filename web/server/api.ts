import { compareSongs } from '../shared/compare';
import { isDifficulty, poolSize } from '../shared/difficulty';
import type { GameState } from '../shared/types';
import type { CatalogRepository } from './repository';
import { SessionCodec, type Session } from './session';

class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

const MAX_GUESSES = 8;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function json(value: unknown, status = 200, extra: Record<string, string> = {}) { return new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } }); }

export function createApi(repository: CatalogRepository, secret: string) {
  const sessions = new SessionCodec(secret);

  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('JSON_REQUIRED', 415);
    if (Number(request.headers.get('content-length') ?? 0) > 4096) throw new ApiError('BODY_TOO_LARGE', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError('INVALID_BODY', 400);
    const parts: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new ApiError('BODY_TOO_LARGE', 413); }
      parts.push(value);
    }
    try {
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
      return body;
    } catch { throw new ApiError('INVALID_BODY', 400); }
  }

  async function state(session: Session): Promise<GameState> {
    const difficulty = session.difficulty ?? 'advanced';
    const catalog = await repository.getCatalog();
    const answer = await repository.getSong(session.answerId);
    if (!answer) throw new ApiError('CATALOG_CHANGED', 409);
    const guessed = await Promise.all(session.guessedIds.map(id => repository.getSong(id)));
    if (guessed.some(song => !song)) throw new ApiError('CATALOG_CHANGED', 409);
    const won = session.guessedIds.includes(answer.id);
    const status = won ? 'won' : session.gaveUp || session.guessedIds.length >= MAX_GUESSES ? 'lost' : 'playing';
    return { token: await sessions.seal(session), catalogVersion: session.catalogVersion, status, maxGuesses: MAX_GUESSES,
      difficulty, poolSize: poolSize(difficulty, catalog.songs.length),
      guesses: guessed.map(song => compareSongs(song!, answer)), ...(status !== 'playing' ? { answer } : {}) };
  }

  return async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/health' && request.method === 'GET') {
        const catalog = await repository.getCatalog();
        return json({ ok: true, songs: catalog.songs.length, version: catalog.version });
      }
      if (url.pathname === '/api/catalog' && request.method === 'GET') {
        const catalog = await repository.getCatalog();
        return json(catalog, 200, { 'Cache-Control': 'public, max-age=300', ETag: `"${catalog.version}"` });
      }
      if (request.method !== 'POST') throw new ApiError('NOT_FOUND', 404);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new ApiError('ORIGIN_REJECTED', 403);
      if (!['/api/games', '/api/games/guess', '/api/games/resume', '/api/games/reveal'].includes(url.pathname)) throw new ApiError('NOT_FOUND', 404);
      const body = await readBody(request);
      const catalog = await repository.getCatalog();
      if (!catalog.songs.length) throw new ApiError('CATALOG_EMPTY', 503);
      if (url.pathname === '/api/games') {
        const difficulty = body.difficulty ?? 'beginner';
        if (!isDifficulty(difficulty)) throw new ApiError('INVALID_DIFFICULTY', 400);
        // Rejection sampling avoids modulo bias without any runtime-specific random API.
        const size = poolSize(difficulty, catalog.songs.length);
        const boundary = Math.floor(0x100000000 / size) * size;
        let random: number;
        do { random = crypto.getRandomValues(new Uint32Array(1))[0]; } while (random >= boundary);
        const answer = await repository.getSongAt(random % size);
        if (!answer) throw new ApiError('CATALOG_EMPTY', 503);
        return json(await state({ answerId: answer.id, guessedIds: [], difficulty, catalogVersion: catalog.version, expiresAt: Date.now() + 7 * 86400000 }));
      }
      if (typeof body.token !== 'string') throw new ApiError('INVALID_SESSION', 400);
      let session: Session;
      try { session = await sessions.open(body.token); } catch { throw new ApiError('INVALID_SESSION', 400); }
      if (session.catalogVersion !== catalog.version) throw new ApiError('CATALOG_CHANGED', 409);
      if (url.pathname === '/api/games/resume') return json(await state(session));
      if (session.gaveUp || session.guessedIds.includes(session.answerId) || session.guessedIds.length >= MAX_GUESSES) throw new ApiError('GAME_FINISHED', 409);
      if (url.pathname === '/api/games/reveal') {
        session.gaveUp = true;
        return json(await state(session));
      }
      if (typeof body.songId !== 'number' || !Number.isSafeInteger(body.songId)) throw new ApiError('INVALID_SONG', 400);
      if (session.guessedIds.includes(body.songId)) throw new ApiError('ALREADY_GUESSED', 409);
      const allowedSongs = catalog.songs.slice(0, poolSize(session.difficulty ?? 'advanced', catalog.songs.length));
      if (!allowedSongs.some(song => song.id === body.songId)) throw new ApiError('OUTSIDE_POOL', 400);
      if (!await repository.getSong(body.songId)) throw new ApiError('INVALID_SONG', 400);
      session.guessedIds.push(body.songId);
      return json(await state(session));
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.code }, error.status);
      console.error('Game API failed', error instanceof Error ? error.message : 'unknown error');
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}
