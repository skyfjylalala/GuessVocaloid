"""Extract popularity candidates locally, without querying VocaDB.

pip install duckdb
python scripts/extract-snapshot.py
Input: data/raw/*.parquet (Hugging Face's public Parquet export)
Output: data/raw/candidates.ndjson
"""
from pathlib import Path
import json
import sys

# Optional checkout-local installation, without modifying the system interpreter.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.python-deps'))
import duckdb

root = Path(__file__).resolve().parents[1]
files = sorted((root / 'data/raw').glob('*.parquet'))
if len(files) != 4:
    raise SystemExit('Expected all four songs/train Parquet shards in data/raw. See README.')
conn = duckdb.connect()
conn.execute('SET memory_limit = \'512MB\'')
conn.execute('SET threads = 2')
query = """
SELECT * FROM read_parquet(?) AS songs
WHERE songType = 'Original' AND EXISTS (
    SELECT 1 FROM json_each(TRY_CAST(songs.views AS JSON)) AS platform,
    json_each(platform.value) AS video
    WHERE TRY_CAST(json_extract_string(video.value, '$.views') AS BIGINT) >= 1000000
)
"""
result = conn.execute(query, [[str(f) for f in files]])
columns = [item[0] for item in result.description]
count = 0
with (root / 'data/raw/candidates.ndjson').open('w', encoding='utf-8') as output:
    while rows := result.fetchmany(250):
        for row in rows:
            output.write(json.dumps(dict(zip(columns, row)), ensure_ascii=False, default=str) + '\n')
            count += 1
print(json.dumps({'shards': len(files), 'popularityCandidates': count}))
