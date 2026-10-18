import type { Difficulty } from './difficulty';

export interface Artist { id: number; name: string }
export interface Song {
  id: number;
  title: string;
  aliases: string[];
  vocalists: Artist[];
  producers: Artist[];
  year: number | null;
  lengthSeconds: number | null;
  bpmMin: number | null;
  bpmMax: number | null;
  views: Record<string, number>;
  links: { label: string; url: string }[];
  sourceUrl: string;
}
export interface SearchSong {
  id: number;
  title: string;
  aliases: string[];
  producer: string;
}
export type Comparison = 'match' | 'partial' | 'higher' | 'lower' | 'different' | 'unknown';
export type Attribute = 'vocalists' | 'producers' | 'year' | 'bpm' | 'length';
export interface Guess {
  song: Song;
  feedback: Record<Attribute, Comparison>;
}
export interface GameState {
  token: string;
  catalogVersion: string;
  status: 'playing' | 'won' | 'lost';
  guesses: Guess[];
  maxGuesses: number;
  difficulty: Difficulty;
  poolSize: number;
  answer?: Song;
}
export interface Catalog {
  version: string;
  songs: SearchSong[];
  source: { name: string; url: string; licenseUrl: string; snapshotRevision: string; importedAt: string; selection: string };
}
