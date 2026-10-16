"""SQLite buffer shared by the logger and uploader."""
import sqlite3
import time

TABLES = ("readings", "events")

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,  -- never reused: upload key
  ts       REAL    NOT NULL,                   -- UTC seconds
  temp_c   REAL    NOT NULL,
  rh_pct   REAL    NOT NULL,
  clock_ok INTEGER NOT NULL,                   -- 1 if time was synced
  uploaded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_readings_unsent ON readings (uploaded, id);
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       REAL    NOT NULL,
  kind     TEXT    NOT NULL,                   -- e.g. sensor_silent, ok
  detail   TEXT,
  uploaded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_unsent ON events (uploaded, id);
"""


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=5)  # wait up to 5 s for the other service's lock
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")   # reader and writer don't block each other
        self.db.execute("PRAGMA synchronous=FULL")   # committed rows survive power loss
        self.db.executescript(SCHEMA)

    def add_reading(self, r, clock_ok: bool):
        with self.db:  # one transaction per row
            self.db.execute(
                "INSERT INTO readings (ts, temp_c, rh_pct, clock_ok) VALUES (?, ?, ?, ?)",
                (r.ts, r.temp_c, r.rh_pct, int(clock_ok)))

    def add_event(self, kind: str, detail: str | None = None):
        with self.db:
            self.db.execute("INSERT INTO events (ts, kind, detail) VALUES (?, ?, ?)",
                            (time.time(), kind, detail))

    def unsent(self, table: str, limit: int = 200) -> list[dict]:
        assert table in TABLES  # table names can't be SQL parameters
        rows = self.db.execute(
            f"SELECT * FROM {table} WHERE uploaded = 0 ORDER BY id LIMIT ?", (limit,))
        return [{k: row[k] for k in row.keys() if k != "uploaded"} for row in rows]

    def mark_uploaded(self, table: str, ids: list[int]):
        assert table in TABLES
        with self.db:
            self.db.executemany(f"UPDATE {table} SET uploaded = 1 WHERE id = ?", [(i,) for i in ids])

    def cleanup(self, keep_days: float = 7):
        """Delete uploaded rows older than keep_days. Unsent rows are never deleted."""
        cutoff = time.time() - keep_days * 86400
        with self.db:
            for t in TABLES:
                self.db.execute(f"DELETE FROM {t} WHERE uploaded = 1 AND ts < ?", (cutoff,))
