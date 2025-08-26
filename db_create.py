#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
db_create.py — builds (or refreshes) the SQLite database for the Greek numerology app.

New schema:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- word TEXT UNIQUE NOT NULL
- n1..n6 INTEGER NOT NULL
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- indices on word and n1..n6
- WAL journaling for better concurrency

Usage:
    python db_create.py                # (re)create schema and import dataset.csv if present
    python db_create.py --force        # delete existing DB before recreating
    python db_create.py --db path.db   # use a custom path
    python db_create.py --no-import    # skip dataset import

Notes:
- Import expects a UTF-8 tab-separated file 'dataset.csv' next to this script; the first column must be the word.
- The script is idempotent thanks to UPSERT (ON CONFLICT(word) DO UPDATE).
"""

import argparse
import csv
import os
import sqlite3
from typing import Iterable, Tuple

# ---------------- Numerology logic ----------------

vowels = {
    "Α": 1, "Ε": 5, "Η": 7, "Ι": 9, "Ο": 6, "Υ": 2, "Ω": 6
}
consonants = {
    "Β": 2, "Γ": 3, "Δ": 4, "Ζ": 6, "Θ": 8, "Κ": 1, "Λ": 2, "Μ": 3, "Ν": 4,
    "Ξ": 5, "Π": 7, "Ρ": 8, "Σ": 9, "Τ": 1, "Φ": 3, "Χ": 4, "Ψ": 5
}
alphabet_dict = {**vowels, **consonants}

def reduce_number(n: int) -> int:
    n = int(n) if n is not None else 0
    while n >= 10:
        n = sum(int(d) for d in str(n))
    return n

def sum_values(word: str, table: dict) -> int:
    return sum(table.get(ch, 0) for ch in word)

def calculate(word: str) -> Tuple[int, int, int, int, int, int]:
    w = (word or "").strip().upper()
    v = sum_values(w, vowels)
    c = sum_values(w, consonants)
    f = sum_values(w, alphabet_dict)
    return (v, reduce_number(v), c, reduce_number(c), f, reduce_number(f))

# ---------------- Database helpers ----------------

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS words (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  n1   INTEGER NOT NULL,
  n2   INTEGER NOT NULL,
  n3   INTEGER NOT NULL,
  n4   INTEGER NOT NULL,
  n5   INTEGER NOT NULL,
  n6   INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
CREATE INDEX IF NOT EXISTS idx_words_n1 ON words(n1);
CREATE INDEX IF NOT EXISTS idx_words_n2 ON words(n2);
CREATE INDEX IF NOT EXISTS idx_words_n3 ON words(n3);
CREATE INDEX IF NOT EXISTS idx_words_n4 ON words(n4);
CREATE INDEX IF NOT EXISTS idx_words_n5 ON words(n5);
CREATE INDEX IF NOT EXISTS idx_words_n6 ON words(n6);
"""

UPSERT_SQL = """
INSERT INTO words (word, n1, n2, n3, n4, n5, n6)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(word) DO UPDATE SET
  n1=excluded.n1, n2=excluded.n2, n3=excluded.n3,
  n4=excluded.n4, n5=excluded.n5, n6=excluded.n6
"""

def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.row_factory = sqlite3.Row
    return conn

def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()

def recreate_db(db_path: str) -> None:
    if os.path.exists(db_path):
        os.remove(db_path)
    conn = connect(db_path)
    try:
        ensure_schema(conn)
    finally:
        conn.close()

def import_dataset(conn: sqlite3.Connection, dataset_path: str, batch_size: int = 2000) -> int:
    if not os.path.exists(dataset_path):
        print(f"[info] No dataset found at {dataset_path}; skipping import.")
        return 0

    inserted = 0
    batch = []
    with open(dataset_path, "r", encoding="utf-8") as fh:
        reader = csv.reader(fh, delimiter="\t")
        for row in reader:
            if not row:
                continue
            word = (row[0] or "").strip()
            if not word:
                continue
            n1, n2, n3, n4, n5, n6 = calculate(word)
            batch.append((word.upper(), n1, n2, n3, n4, n5, n6))
            if len(batch) >= batch_size:
                conn.executemany(UPSERT_SQL, batch)
                conn.commit()
                inserted += len(batch)
                print(f"[import] committed {inserted} rows...")
                batch = []
    if batch:
        conn.executemany(UPSERT_SQL, batch)
        conn.commit()
        inserted += len(batch)
        print(f"[import] committed final {len(batch)} rows (total {inserted}).")
    return inserted

# ---------------- Main ----------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data.db", help="Path to SQLite DB (default: data.db)")
    parser.add_argument("--force", action="store_true", help="Delete existing DB file before creating schema")
    parser.add_argument("--no-import", action="store_true", help="Skip importing dataset.csv")
    parser.add_argument("--dataset", default="dataset.csv", help="Path to dataset file (default: dataset.csv)")
    args = parser.parse_args()

    if args.force:
        recreate_db(args.db)

    conn = connect(args.db)
    try:
        ensure_schema(conn)
        if not args.no_import:
            import_count = import_dataset(conn, args.dataset)
            print(f"[done] Imported/updated {import_count} rows into {args.db}")
        else:
            print("[info] Skipping import per --no-import")
    finally:
        conn.close()
        print("[ok] Database ready:", args.db)

if __name__ == "__main__":
    main()
