import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
let result = spawnSync(process.execPath,[cli,'d1','migrations','apply','guess-vocaloid','--local'],{stdio:'inherit'});
if(result.status !== 0) process.exit(result.status ?? 1);
result = spawnSync(process.execPath,[cli,'d1','execute','guess-vocaloid','--local','--file=data/seed.sql'],{encoding:'utf8',maxBuffer:8*1024*1024});
if(result.status !== 0) {process.stderr.write(result.stderr || result.stdout || 'Local import failed.');process.exit(result.status ?? 1);}
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
console.log(`Local D1 ready: ${catalog.songs.length} songs imported.`);
