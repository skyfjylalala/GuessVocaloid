CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  vocalists_json TEXT NOT NULL,
  producers_json TEXT NOT NULL,
  year INTEGER,
  length_seconds INTEGER,
  bpm_min REAL,
  bpm_max REAL,
  views_json TEXT NOT NULL,
  links_json TEXT NOT NULL,
  source_url TEXT NOT NULL
);
