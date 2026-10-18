import type { Catalog, SearchSong, Song } from '../shared/types';

export interface CatalogRepository {
  getCatalog(): Promise<Catalog>;
  getSong(id: number): Promise<Song | null>;
  getSongAt(ordinal: number): Promise<Song | null>;
}

// Only this small SQL adapter depends on the database driver. No D1 types enter game logic.
export interface SqlDriver {
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface SongRow {
  id: number; title: string; aliases_json: string; vocalists_json: string; producers_json: string;
  year: number | null; length_seconds: number | null; bpm_min: number | null; bpm_max: number | null;
  views_json: string; links_json: string; source_url: string;
}

function hydrate(row: SongRow | null): Song | null {
  return row && {
    id: row.id, title: row.title, aliases: JSON.parse(row.aliases_json), vocalists: JSON.parse(row.vocalists_json),
    producers: JSON.parse(row.producers_json), year: row.year, lengthSeconds: row.length_seconds,
    bpmMin: row.bpm_min, bpmMax: row.bpm_max, views: JSON.parse(row.views_json),
    links: JSON.parse(row.links_json), sourceUrl: row.source_url,
  };
}

export class SqlCatalogRepository implements CatalogRepository {
  private catalog: Promise<Catalog> | undefined;
  constructor(private driver: SqlDriver) {}
  getCatalog() {
    this.catalog ??= this.loadCatalog().catch(error => { this.catalog = undefined; throw error; });
    return this.catalog;
  }
  private async loadCatalog(): Promise<Catalog> {
    const meta = await this.driver.all<{key: string; value: string}>('SELECT key, value FROM catalog_meta');
    const values = Object.fromEntries(meta.map(row => [row.key, row.value]));
    if (!values.version || !values.source) throw new Error('CATALOG_NOT_IMPORTED');
    const rows = await this.driver.all<Pick<SongRow, 'id' | 'title' | 'aliases_json' | 'producers_json'>>('SELECT id, title, aliases_json, producers_json FROM songs ORDER BY ordinal');
    const songs: SearchSong[] = rows.map(row => ({ id: row.id, title: row.title, aliases: JSON.parse(row.aliases_json),
      producer: JSON.parse(row.producers_json).map((artist: {name: string}) => artist.name).join(' · ') }));
    return { version: values.version, songs, source: JSON.parse(values.source) };
  }
  async getSong(id: number) { return hydrate(await this.driver.get<SongRow>('SELECT * FROM songs WHERE id = ?', [id])); }
  async getSongAt(ordinal: number) { return hydrate(await this.driver.get<SongRow>('SELECT * FROM songs WHERE ordinal = ?', [ordinal])); }
}
