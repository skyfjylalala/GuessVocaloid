import type { SearchSong } from './types';

export function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function createSearchIndex(songs: SearchSong[]) {
  return songs.map(song => ({ song, title: normalizeSearch(song.title),
    terms: [...song.aliases, song.producer].map(normalizeSearch).filter(Boolean) }));
}

export function searchSongs(index: ReturnType<typeof createSearchIndex>, query: string, excluded: Set<number>, limit = 8) {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  return index.filter(({ song }) => !excluded.has(song.id)).map(entry => {
    let score = entry.title === needle ? 0 : entry.title.startsWith(needle) ? 1 : entry.title.includes(needle) ? 3 : 100;
    for (const term of entry.terms) score = Math.min(score, term === needle ? 1 : term.startsWith(needle) ? 2 : term.includes(needle) ? 4 : 100);
    return { ...entry, score };
  }).filter(entry => entry.score < 100).sort((a, b) => a.score - b.score || a.song.title.localeCompare(b.song.title)).slice(0, limit).map(entry => entry.song);
}
