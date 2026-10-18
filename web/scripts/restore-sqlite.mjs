import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw new Error('Usage: node scripts/restore-sqlite.mjs <export.sql> <new.sqlite>');
const target = resolve(destination);
if (existsSync(target)) throw new Error('Destination already exists; choose a new database path.');
mkdirSync(dirname(target),{recursive:true});
const db = new DatabaseSync(target);
try {
  db.exec(readFileSync(input,'utf8'));
  const count = db.prepare('SELECT COUNT(*) AS count FROM songs').get();
  console.log(JSON.stringify({database:target,...count}));
} finally {db.close();}
