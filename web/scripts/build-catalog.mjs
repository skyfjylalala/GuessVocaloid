import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeRow, sqlQuote, uniqueStrings } from './catalog-utils.mjs';

const root = new URL('../', import.meta.url);
const load = path => readFile(new URL(path, root), 'utf8');
const output = (path, content) => writeFile(new URL(path, root), content);
const args = process.argv.slice(2);
const fromSnapshot = args.includes('--snapshot');
let songs, source;
if (fromSnapshot) {
  const aliases = JSON.parse(await load('data/aliases.json'));
  const candidates = new Map(); let scanned = 0;
  const lines = createInterface({ input: createReadStream(new URL('data/raw/candidates.ndjson', root)), crlfDelay: Infinity });
  for await (const line of lines) {
    const song = normalizeRow(JSON.parse(line)); scanned++;
    if (song) { song.aliases = uniqueStrings([...song.aliases, ...(aliases[song.title] ?? [])]); candidates.set(song.id, song); }
  }
  songs = [...candidates.values()].sort((a, b) => Math.max(...Object.values(b.views)) - Math.max(...Object.values(a.views)) || a.id - b.id).slice(0, 1000);
  source = {
    name: 'VocaDB / amiadesu snapshot', url: 'https://huggingface.co/datasets/amiadesu/VocaDBSongs',
    licenseUrl: 'https://wiki.vocadb.net/docs/license',
    snapshotRevision: '87d68d26e0e12c4206d5946d6d5766fe6f89324c (Hugging Face Parquet conversion)',
    importedAt: '2026-10-18',
    selection: 'Original vocal synth songs (Vocaloid, UTAU, CeVIO, Synthesizer V and related singing voicebanks, excluding generic TTS); main vocalist grouped by character; composer/arranger/tuning credits; original PV with at least 1,000,000 snapshot views on Niconico, YouTube or Bilibili; top 1,000 by largest individual original-video view count.',
  };
  await output('data/catalog.json', JSON.stringify({ source, songs }, null, 2) + '\n');
  await output('data/import-report.json', JSON.stringify({ candidateRows: scanned, eligible: candidates.size, imported: songs.length,
    missingYear: songs.filter(song => song.year === null).length, missingBpm: songs.filter(song => song.bpmMin === null || song.bpmMax === null).length,
    missingLength: songs.filter(song => song.lengthSeconds === null).length,
    excludedCoversAndReprints: true, selection: source.selection, snapshotRevision: source.snapshotRevision }, null, 2) + '\n');
} else {
  ({ songs, source } = JSON.parse(await load('data/catalog.json')));
}
if (!songs.length) throw new Error('No eligible songs');
const version = createHash('sha256').update(JSON.stringify({ source, songs })).digest('hex').slice(0, 16);
const columns = 'id,ordinal,title,aliases_json,vocalists_json,producers_json,year,length_seconds,bpm_min,bpm_max,views_json,links_json,source_url';
const sql = ['-- Generated from data/catalog.json; rebuild with pnpm data:import. No media assets.', 'DELETE FROM songs;', 'DELETE FROM catalog_meta;',
  `INSERT INTO catalog_meta (key,value) VALUES ('version',${sqlQuote(version)}),('source',${sqlQuote(JSON.stringify(source))});`];
songs.forEach((song, ordinal) => {
  const values = [song.id, ordinal, song.title, JSON.stringify(song.aliases), JSON.stringify(song.vocalists), JSON.stringify(song.producers), song.year, song.lengthSeconds, song.bpmMin, song.bpmMax, JSON.stringify(song.views), JSON.stringify(song.links), song.sourceUrl];
  sql.push(`INSERT INTO songs (${columns}) VALUES (${values.map(sqlQuote).join(',')});`);
});
await output('data/seed.sql', sql.join('\n') + '\n');
console.log(JSON.stringify({ songs: songs.length, version, seed: fileURLToPath(new URL('data/seed.sql', root)) }));
