import {readFileSync} from 'node:fs';
const voiceTypes = new Set(['Vocaloid', 'UTAU', 'CeVIO', 'SynthesizerV', 'AlterEgo', 'Voiceroid', 'ACEVirtualSinger', 'VOICEVOX', 'AIVOICE', 'VOICEPEAK', 'NEUTRINO', 'NNSVS', 'VocalSharp', 'NewType', 'VoiSona']);
const vocalistGroups = JSON.parse(readFileSync(new URL('../data/vocalist-groups.json',import.meta.url),'utf8')).map(group => ({...group,regex:new RegExp(group.pattern,'iu')}));
function vocalistIdentity(entry) {
  const group = vocalistGroups.find(group => group.regex.test(entry.artist.name || entry.name));
  return group ? {id:group.id,name:group.name} : {id:entry.artist.id,name:entry.name || entry.artist.name};
}
export function parseNested(value, fallback) {
  if (typeof value === 'object' && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
export function safeVideoUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const allowed = ['www.nicovideo.jp', 'nicovideo.jp', 'nico.ms', 'www.youtube.com', 'youtube.com', 'youtu.be', 'www.bilibili.com', 'bilibili.com', 'b23.tv'];
    if (!allowed.includes(url.hostname)) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}
function videoKey(value) {
  const safe = safeVideoUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.hostname.includes('youtu')) return `youtube:${url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') ?? url.pathname.split('/').pop()}`;
  if (url.hostname.includes('nico')) return `nico:${url.pathname.split('/').pop()}`;
  return `bilibili:${url.pathname.replace(/\/$/, '')}`;
}
export function normalizeRow(row, minimumViews = 1_000_000) {
  if (row.songType !== 'Original' || !Number.isSafeInteger(row.id)) return null;
  const artists = parseNested(row.artists, []);
  const unique = list => [...new Map(list.map(item => [item.id, item])).values()];
  const toArtist = entry => ({ id: entry.artist.id, name: entry.name || entry.artist.name });
  const vocalists = unique(artists.filter(entry => entry.artist && !entry.artist.deleted && !entry.isSupport && voiceTypes.has(entry.artist.artistType) && String(entry.categories).split(',').map(s => s.trim()).includes('Vocalist')).map(vocalistIdentity));
  const producers = unique(artists.filter(entry => entry.artist && !entry.artist.deleted && String(entry.categories).includes('Producer') && /Composer|Arranger|VoiceManipulator|Default/.test(entry.effectiveRoles ?? entry.roles ?? 'Default')).map(toArtist));
  if (!vocalists.length || !producers.length) return null;
  const pvs = parseNested(row.pvs, []).filter(pv => pv.pvType === 'Original' && !pv.disabled && safeVideoUrl(pv.url));
  const originalKeys = new Set(pvs.map(pv => videoKey(pv.url)).filter(Boolean));
  const views = {};
  for (const [platform, videos] of Object.entries(parseNested(row.views, {}))) {
    if (!['NicoNicoDouga', 'Youtube', 'Bilibili'].includes(platform) || !Array.isArray(videos)) continue;
    const counts = videos.filter(video => originalKeys.has(videoKey(video.url))).map(video => video.views).filter(value => Number.isSafeInteger(value) && value >= 0);
    if (counts.length) views[platform] = Math.max(...counts);
  }
  if (!Object.values(views).some(value => value >= minimumViews)) return null;
  const year = row.publishDate ? Number(String(row.publishDate).slice(0, 4)) : null;
  const title = String(row.defaultName || row.name).trim();
  const aliases = uniqueStrings([row.name, ...String(row.additionalNames ?? '').split(/,\s*/), ...parseNested(row.names, []).map(name => name.value)]).filter(name => name !== title);
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const minBpm = positive(row.minMilliBpm), maxBpm = positive(row.maxMilliBpm);
  return {
    id: row.id, title, aliases, vocalists, producers,
    year: year && year >= 1990 && year <= new Date().getUTCFullYear() ? year : null,
    lengthSeconds: positive(row.lengthSeconds),
    bpmMin: minBpm !== null ? minBpm / 1000 : null, bpmMax: maxBpm !== null ? maxBpm / 1000 : null,
    views,
    links: pvs.filter((pv, i, list) => list.findIndex(other => other.service === pv.service) === i).map(pv => ({ label: pv.service === 'NicoNicoDouga' ? 'Niconico' : pv.service === 'Youtube' ? 'YouTube' : 'Bilibili', url: safeVideoUrl(pv.url) })),
    sourceUrl: `https://vocadb.net/S/${row.id}`,
  };
}
export function uniqueStrings(values) { return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]; }
export function sqlQuote(value) { return value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`; }
