import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { compareSongs } from '../shared/compare';
import { createSearchIndex, searchSongs } from '../shared/search';
import { DIFFICULTY_LIMITS, poolSize } from '../shared/difficulty';
import { SessionCodec } from '../server/session';
import { createApi } from '../server/api';
import { SqlCatalogRepository, type CatalogRepository } from '../server/repository';
import type { Catalog, GameState, Song } from '../shared/types';

const secret = 'test-only-session-secret-with-at-least-32-characters';
const base: Song = { id: 1, title: '千本桜', aliases: ['千本樱', 'Senbonzakura'], vocalists: [{ id:1, name:'初音ミク' }], producers: [{id:3, name:'黒うさP'}],
  year:2011, bpmMin:154, bpmMax:154, lengthSeconds:244, views:{NicoNicoDouga:1_000_000}, links:[], sourceUrl:'https://vocadb.net/S/1' };

test('comparisons use IDs, set overlap and answer-relative numeric arrows', () => {
  const guess = { ...base, vocalists:[{id:1,name:'Miku'},{id:2,name:'Rin'}], year:2009, bpmMin:160, bpmMax:170, lengthSeconds:300 };
  const feedback = compareSongs(guess, base).feedback;
  assert.deepEqual(feedback, {vocalists:'partial', producers:'match', year:'higher', bpm:'lower', length:'lower'});
  assert.equal(compareSongs({...base, vocalists:[{id:1,name:'renamed'}]}, base).feedback.vocalists, 'match');
  assert.equal(compareSongs({...base, vocalists:[{id:7,name:'初音ミク'}]}, base).feedback.vocalists, 'different');
});
test('BPM ranges overlap, missing fields are unknown, exact seconds matter', () => {
  assert.equal(compareSongs({...base,bpmMin:150,bpmMax:160}, base).feedback.bpm, 'partial');
  const missing = compareSongs({...base,year:null,bpmMin:null,lengthSeconds:null,producers:[]}, base).feedback;
  assert.equal(missing.year,'unknown'); assert.equal(missing.bpm,'unknown'); assert.equal(missing.length,'unknown'); assert.equal(missing.producers,'unknown');
  assert.equal(compareSongs({...base,lengthSeconds:243},base).feedback.length,'higher');
});
test('search handles Japanese, Chinese aliases, full-width Latin and guessed exclusion', () => {
  const index = createSearchIndex([{id:1,title:base.title,aliases:base.aliases,producer:'黒うさP'}, {id:2,title:'OTHER',aliases:[],producer:'Someone'}]);
  for (const query of ['千本樱', 'Ｓｅｎｂｏｎｚａｋｕｒａ', '黒うさ']) assert.equal(searchSongs(index, query, new Set())[0].id,1);
  assert.deepEqual(searchSongs(index,'千本桜',new Set([1])),[]);
  assert.deepEqual(searchSongs(index,' ',new Set()),[]);
});
test('session encryption rejects tampering, expiry and a different key', async () => {
  const codec = new SessionCodec(secret);
  const session = {answerId:1,guessedIds:[],catalogVersion:'test',expiresAt:Date.now()+10_000};
  const token = await codec.seal(session);
  assert.deepEqual(await codec.open(token),session);
  const [prefix,iv,cipher] = token.split('.');
  await assert.rejects(codec.open(`${prefix}.${iv}.${cipher[0] === 'A' ? 'B' : 'A'}${cipher.slice(1)}`));
  await assert.rejects(new SessionCodec(secret+'other').open(token));
  await assert.rejects(codec.open(await codec.seal({...session,expiresAt:Date.now()-1})));
  await assert.rejects(codec.open(await codec.seal({...session,guessedIds:[2,2]})));
});

function fixture(songCount = 12) {
  const songs = Array.from({length:songCount}, (_, i) => ({...base,id:i+1,title:`song-${i+1}`}));
  const catalog: Catalog = {version:'test-v1',songs:songs.map(song => ({id:song.id,title:song.title,aliases:[],producer:'producer'})), source:{name:'test',url:'https://example.com',licenseUrl:'https://example.com',snapshotRevision:'test',importedAt:'2026-10-18',selection:'test'}};
  const repo: CatalogRepository = {async getCatalog(){return catalog;},async getSong(id){return songs.find(song => song.id === id) ?? null;},async getSongAt(ordinal){return songs[ordinal] ?? null;}};
  const api = createApi(repo,secret);
  const post = async (path: string, body: unknown) => {
    const response = await api(new Request(`https://game.test/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    return {response,body:await response.json() as GameState & {error?:string}};
  };
  return {songs,catalog,api,post};
}
test('API hides the answer, resumes state, rejects duplicate guesses and finishes a win', async () => {
  const {post,songs,api} = fixture();
  const {body:initial} = await post('games',{});
  assert.equal(initial.status,'playing'); assert.equal(initial.answer,undefined);
  const session = await new SessionCodec(secret).open(initial.token);
  const wrongId = songs.find(song => song.id !== session.answerId)!.id;
  const {body:first} = await post('games/guess',{token:initial.token,songId:wrongId});
  assert.equal(first.guesses.length,1); assert.equal(first.answer,undefined);
  const duplicate = await post('games/guess',{token:first.token,songId:wrongId});
  assert.equal(duplicate.response.status,409); assert.equal(duplicate.body.error,'ALREADY_GUESSED');
  const resumed = await post('games/resume',{token:first.token});
  assert.deepEqual(resumed.body.guesses,first.guesses);
  const {body:won} = await post('games/guess',{token:first.token,songId:session.answerId});
  assert.equal(won.status,'won'); assert.equal(won.answer?.id,session.answerId);
  const after = await post('games/guess',{token:won.token,songId:wrongId}); assert.equal(after.body.error,'GAME_FINISHED');
  const catalogResponse = await api(new Request('https://game.test/api/catalog'));
  const publicCatalog = JSON.stringify(await catalogResponse.json());
  assert.ok(!publicCatalog.includes('answerId')); assert.ok(!publicCatalog.includes('bpmMin'));
});
test('eight wrong guesses lose, reveal stays finished after resume, version changes invalidate sessions', async () => {
  const {post,songs,catalog} = fixture();
  let {body:game} = await post('games',{});
  const session = await new SessionCodec(secret).open(game.token);
  for (const song of songs.filter(song => song.id !== session.answerId).slice(0,8)) ({body:game}=await post('games/guess',{token:game.token,songId:song.id}));
  assert.equal(game.status,'lost'); assert.equal(game.guesses.length,8); assert.equal(game.answer?.id,session.answerId);
  const next = await post('games',{});
  const revealed = await post('games/reveal',{token:next.body.token});
  assert.equal(revealed.body.status,'lost'); assert.ok(revealed.body.answer);
  const resumed = await post('games/resume',{token:revealed.body.token}); assert.equal(resumed.body.status,'lost');
  const invalid = await post('games/guess',{token:revealed.body.token,songId:1}); assert.equal(invalid.body.error,'GAME_FINISHED');
  const fresh = await post('games',{}); catalog.version='test-v2';
  assert.equal((await post('games/resume',{token:fresh.body.token})).body.error,'CATALOG_CHANGED');
});
test('API validates origin, JSON, body size, unknown IDs, malformed sessions and routes', async () => {
  const {api,post} = fixture();
  assert.equal((await api(new Request('https://game.test/api/games',{method:'POST',headers:{origin:'https://evil.test','Content-Type':'application/json'},body:'{}'}))).status,403);
  assert.equal((await api(new Request('https://game.test/api/games',{method:'POST',body:'{}'}))).status,415);
  assert.equal((await api(new Request('https://game.test/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(5000)}))).status,413);
  assert.equal((await post('games',[])).response.status,400);
  assert.equal((await post('games/resume',{token:'garbage'})).response.status,400);
  const {body:game}=await post('games',{});
  for (const id of [99999,'1',null,1.2]) assert.equal((await post('games/guess',{token:game.token,songId:id})).response.status,400);
  assert.equal((await api(new Request('https://game.test/api/unknown'))).status,404);
});
test('real exported catalog loads into standard SQLite and runs the same API without Cloudflare', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync('migrations/0001_catalog.sql','utf8'));
    db.exec(readFileSync('data/seed.sql','utf8'));
    const repo = new SqlCatalogRepository({
      async get<T>(sql:string, params:unknown[]=[]){return db.prepare(sql).get(...params as SQLInputValue[]) as T ?? null;},
      async all<T>(sql:string, params:unknown[]=[]){return db.prepare(sql).all(...params as SQLInputValue[]) as T[];},
    });
    const catalog = await repo.getCatalog(); assert.equal(catalog.songs.length,1000);
    const raw = JSON.parse(readFileSync('data/catalog.json','utf8')) as {songs:Song[]};
    for (let i=1;i<raw.songs.length;i++) assert.ok(Math.max(...Object.values(raw.songs[i-1].views)) >= Math.max(...Object.values(raw.songs[i].views)), 'catalog order must be descending by original-video views');
    for (const ordinal of [0,10,999]) assert.deepEqual(await repo.getSongAt(ordinal),raw.songs[ordinal]);
    assert.equal(await repo.getSong(-1),null);
    const api = createApi(repo,secret);
    const response = await api(new Request('https://game.test/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
    const game=await response.json() as GameState;
    assert.equal(response.status,200); assert.equal(game.answer,undefined);
    const {answerId}=await new SessionCodec(secret).open(game.token);
    const guessed=await api(new Request('https://game.test/api/games/guess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:game.token,songId:answerId})}));
    assert.equal((await guessed.json() as GameState).status,'won');
  } finally { db.close(); }
});
test('difficulty limits constrain answers, reject guesses outside the pool, and survive resume', async () => {
  const {post} = fixture(1000);
  const codec = new SessionCodec(secret);
  for (const difficulty of ['beginner','intermediate','advanced'] as const) {
    const limit = DIFFICULTY_LIMITS[difficulty];
    for (let i=0;i<12;i++) {
      const {body:game,response} = await post('games',{difficulty});
      assert.equal(response.status,200); assert.equal(game.difficulty,difficulty); assert.equal(game.poolSize,limit);
      const session = await codec.open(game.token);
      assert.equal(session.difficulty,difficulty); assert.ok(session.answerId>=1 && session.answerId<=limit);
      const resumed = await post('games/resume',{token:game.token}); assert.equal(resumed.body.difficulty,difficulty);
      if (difficulty !== 'advanced') {
        const outside = await post('games/guess',{token:game.token,songId:limit+1,difficulty:'advanced'});
        assert.equal(outside.response.status,400); assert.equal(outside.body.error,'OUTSIDE_POOL');
      }
    }
  }
  assert.equal((await post('games',{})).body.difficulty,'beginner');
  assert.equal(poolSize('beginner',12),12);
  for (const difficulty of ['invalid',0,{},true]) assert.equal((await post('games',{difficulty})).body.error,'INVALID_DIFFICULTY');
});
test('pre-difficulty sessions resume as advanced without resetting the round', async () => {
  const {post}=fixture(1000);
  const token=await new SessionCodec(secret).seal({answerId:999,guessedIds:[900],catalogVersion:'test-v1',expiresAt:Date.now()+60_000});
  const resumed=await post('games/resume',{token});
  assert.equal(resumed.body.difficulty,'advanced'); assert.equal(resumed.body.poolSize,1000); assert.equal(resumed.body.guesses[0].song.id,900);
  const won=await post('games/guess',{token:resumed.body.token,songId:999}); assert.equal(won.body.status,'won');
});
