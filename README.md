# Greek Numerology Flask App

Features:
- SQLite-backed words table with n1..n6 values.
- Filter by word substring and n1..n6 (exact or min/max).
- Add/update words (space/comma/newline separated); values are computed server-side.
- Delete rows inline.
- Sort columns, paginate, and export current filter set to CSV.
- Fast filtering with indices on n1..n6 and `word`.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install flask
export FLASK_APP=app

# Run
flask run --debug
```

Open http://127.0.0.1:5000

### Configuration

- `NUM_DB_PATH`: set to an absolute path to use a different SQLite file.
- `FLASK_SECRET`: override session secret.

### Initial DB creation

The initial database was created from the https://psychology.nottingham.ac.uk/greeklex/greeklex1.html
Use the GreekLex_UpperCase.txt from the downloaded zip.