import sqlite3
import json
import os
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any


DB_PATH = os.environ.get("ROBOT_MANAGER_DB", "/app/data/robot_manager.db")


class Database:
    """Thread-safe SQLite database for Robot Manager."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._local = threading.local()

    # ── connection management ────────────────────────────────────

    def _get_conn(self) -> sqlite3.Connection:
        """Return a per-thread connection (creates one if needed)."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            self._local.conn = conn
        return conn

    # ── schema bootstrap ─────────────────────────────────────────

    def init_tables(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS recording_configs (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                -- robot settings
                robot_type  TEXT NOT NULL,
                robot_port  TEXT NOT NULL,
                robot_id    TEXT NOT NULL,
                -- cameras (JSON array of camera dicts)
                cameras     TEXT NOT NULL DEFAULT '[]',
                -- teleop settings (NULL when using policy)
                teleop_type TEXT,
                teleop_port TEXT,
                teleop_id   TEXT,
                -- policy settings (NULL when using teleop)
                policy_path TEXT,
                policy_type TEXT,
                policy_device TEXT,
                -- dataset settings
                repo_id     TEXT NOT NULL,
                num_episodes INTEGER NOT NULL DEFAULT 10,
                single_task TEXT NOT NULL DEFAULT '',
                fps         INTEGER NOT NULL DEFAULT 30,
                episode_time_s INTEGER NOT NULL DEFAULT 30,
                reset_time_s INTEGER NOT NULL DEFAULT 10,
                display_data INTEGER NOT NULL DEFAULT 0,
                play_sounds INTEGER NOT NULL DEFAULT 0,
                push_to_hub INTEGER NOT NULL DEFAULT 1,
                -- meta
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS datasets (
                id          TEXT PRIMARY KEY,
                config_id   TEXT NOT NULL REFERENCES recording_configs(id) ON DELETE CASCADE,
                repo_id     TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'created',   -- created, recording, paused, completed, failed
                total_episodes INTEGER NOT NULL DEFAULT 0,
                completed_episodes INTEGER NOT NULL DEFAULT 0,
                single_task TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS episodes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id  TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
                episode_num INTEGER NOT NULL,
                status      TEXT NOT NULL DEFAULT 'pending',   -- pending, recording, completed, failed
                session_id  TEXT,                               -- interactive session id
                started_at  TEXT,
                completed_at TEXT,
                duration_s  REAL,
                created_at  TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_datasets_config ON datasets(config_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_dataset ON episodes(dataset_id);

            -- ── Persistent state tables ─────────────────────────────────

            CREATE TABLE IF NOT EXISTS identified_ports (
                arm_name    TEXT PRIMARY KEY,
                port_path   TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS calibration_records (
                id          TEXT PRIMARY KEY,   -- e.g. "teleop:leader" or "robot:follower"
                arm_name    TEXT NOT NULL,       -- "leader" or "follower"
                arm_role    TEXT NOT NULL,       -- "teleop" or "robot"
                robot_type  TEXT NOT NULL,       -- e.g. "so101_leader"
                robot_id    TEXT NOT NULL,       -- e.g. "leader"
                port        TEXT NOT NULL,       -- port used during calibration
                cal_file    TEXT,                -- path to the calibration JSON file
                status      TEXT NOT NULL DEFAULT 'completed',  -- completed, invalid
                calibrated_at TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS robot_state (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
        """)
        conn.commit()

        # ── migrate existing tables (add new columns if missing) ──
        self._migrate_recording_configs(conn)

    def _migrate_recording_configs(self, conn: sqlite3.Connection):
        """Add new columns to recording_configs if they don't exist yet (for DB upgrades)."""
        cursor = conn.execute("PRAGMA table_info(recording_configs)")
        existing_cols = {row[1] for row in cursor.fetchall()}
        migrations = [
            ("episode_time_s", "INTEGER NOT NULL DEFAULT 30"),
            ("reset_time_s", "INTEGER NOT NULL DEFAULT 10"),
            ("play_sounds", "INTEGER NOT NULL DEFAULT 0"),
            ("push_to_hub", "INTEGER NOT NULL DEFAULT 1"),
            ("policy_type", "TEXT"),
            ("policy_device", "TEXT"),
        ]
        for col_name, col_def in migrations:
            if col_name not in existing_cols:
                conn.execute(f"ALTER TABLE recording_configs ADD COLUMN {col_name} {col_def}")
        conn.commit()

    # ── recording_configs CRUD ───────────────────────────────────

    def create_config(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        data["created_at"] = now
        data["updated_at"] = now
        if isinstance(data.get("cameras"), (list, dict)):
            data["cameras"] = json.dumps(data["cameras"])
        cols = ", ".join(data.keys())
        placeholders = ", ".join(["?"] * len(data))
        conn.execute(f"INSERT INTO recording_configs ({cols}) VALUES ({placeholders})", list(data.values()))
        conn.commit()
        return self.get_config(data["id"])

    def get_config(self, config_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM recording_configs WHERE id = ?", (config_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["cameras"] = json.loads(d["cameras"]) if d["cameras"] else []
        d["display_data"] = bool(d["display_data"])
        d["play_sounds"] = bool(d.get("play_sounds", 0))
        d["push_to_hub"] = bool(d.get("push_to_hub", 1))
        return d

    def list_configs(self) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM recording_configs ORDER BY created_at DESC").fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["cameras"] = json.loads(d["cameras"]) if d["cameras"] else []
            d["display_data"] = bool(d["display_data"])
            d["play_sounds"] = bool(d.get("play_sounds", 0))
            d["push_to_hub"] = bool(d.get("push_to_hub", 1))
            results.append(d)
        return results

    def update_config(self, config_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        data["updated_at"] = datetime.utcnow().isoformat()
        if isinstance(data.get("cameras"), (list, dict)):
            data["cameras"] = json.dumps(data["cameras"])
        sets = ", ".join([f"{k} = ?" for k in data.keys()])
        conn.execute(f"UPDATE recording_configs SET {sets} WHERE id = ?", list(data.values()) + [config_id])
        conn.commit()
        return self.get_config(config_id)

    def delete_config(self, config_id: str) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM recording_configs WHERE id = ?", (config_id,))
        conn.commit()
        return cur.rowcount > 0

    # ── datasets CRUD ────────────────────────────────────────────

    def create_dataset(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        data["created_at"] = now
        data["updated_at"] = now
        cols = ", ".join(data.keys())
        placeholders = ", ".join(["?"] * len(data))
        conn.execute(f"INSERT INTO datasets ({cols}) VALUES ({placeholders})", list(data.values()))
        conn.commit()
        return self.get_dataset(data["id"])

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
        return dict(row) if row else None

    def list_datasets(self, config_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        if config_id:
            rows = conn.execute(
                "SELECT * FROM datasets WHERE config_id = ? ORDER BY created_at DESC",
                (config_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM datasets ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]

    def update_dataset(self, dataset_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        data["updated_at"] = datetime.utcnow().isoformat()
        sets = ", ".join([f"{k} = ?" for k in data.keys()])
        conn.execute(f"UPDATE datasets SET {sets} WHERE id = ?", list(data.values()) + [dataset_id])
        conn.commit()
        return self.get_dataset(dataset_id)

    def delete_dataset(self, dataset_id: str) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
        return cur.rowcount > 0

    # ── episodes CRUD ────────────────────────────────────────────

    def create_episode(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self._get_conn()
        data["created_at"] = datetime.utcnow().isoformat()
        cols = ", ".join(data.keys())
        placeholders = ", ".join(["?"] * len(data))
        cur = conn.execute(f"INSERT INTO episodes ({cols}) VALUES ({placeholders})", list(data.values()))
        conn.commit()
        return self.get_episode(cur.lastrowid)

    def get_episode(self, episode_id: int) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        return dict(row) if row else None

    def list_episodes(self, dataset_id: str) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM episodes WHERE dataset_id = ? ORDER BY episode_num",
            (dataset_id,)
        ).fetchall()
        return [dict(r) for r in rows]

    def update_episode(self, episode_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        sets = ", ".join([f"{k} = ?" for k in data.keys()])
        conn.execute(f"UPDATE episodes SET {sets} WHERE id = ?", list(data.values()) + [episode_id])
        conn.commit()
        return self.get_episode(episode_id)

    def delete_episode(self, episode_id: int) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM episodes WHERE id = ?", (episode_id,))
        conn.commit()
        return cur.rowcount > 0

    # ── identified_ports CRUD ────────────────────────────────────

    def save_port(self, arm_name: str, port_path: str) -> Dict[str, Any]:
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO identified_ports (arm_name, port_path, updated_at) VALUES (?, ?, ?)",
            (arm_name, port_path, now)
        )
        conn.commit()
        return {"arm_name": arm_name, "port_path": port_path, "updated_at": now}

    def get_all_ports(self) -> Dict[str, str]:
        conn = self._get_conn()
        rows = conn.execute("SELECT arm_name, port_path FROM identified_ports").fetchall()
        return {row["arm_name"]: row["port_path"] for row in rows}

    def delete_port(self, arm_name: str) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM identified_ports WHERE arm_name = ?", (arm_name,))
        conn.commit()
        return cur.rowcount > 0

    def delete_all_ports(self) -> int:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM identified_ports")
        conn.commit()
        return cur.rowcount

    # ── calibration_records CRUD ─────────────────────────────────

    def save_calibration(self, data: Dict[str, Any]) -> Dict[str, Any]:
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        data["updated_at"] = now
        if "calibrated_at" not in data:
            data["calibrated_at"] = now
        conn.execute(
            """INSERT OR REPLACE INTO calibration_records
               (id, arm_name, arm_role, robot_type, robot_id, port, cal_file, status, calibrated_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["id"], data["arm_name"], data["arm_role"], data["robot_type"],
                data["robot_id"], data["port"], data.get("cal_file"),
                data.get("status", "completed"), data["calibrated_at"], data["updated_at"]
            )
        )
        conn.commit()
        return self.get_calibration(data["id"])

    def get_calibration(self, cal_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM calibration_records WHERE id = ?", (cal_id,)).fetchone()
        return dict(row) if row else None

    def list_calibrations(self) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM calibration_records ORDER BY calibrated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def delete_calibration(self, cal_id: str) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM calibration_records WHERE id = ?", (cal_id,))
        conn.commit()
        return cur.rowcount > 0

    def delete_all_calibrations(self) -> int:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM calibration_records")
        conn.commit()
        return cur.rowcount

    # ── robot_state (generic KV) ─────────────────────────────────

    def set_state(self, key: str, value: str):
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO robot_state (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, now)
        )
        conn.commit()

    def get_state(self, key: str) -> Optional[str]:
        conn = self._get_conn()
        row = conn.execute("SELECT value FROM robot_state WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    def delete_state(self, key: str) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM robot_state WHERE key = ?", (key,))
        conn.commit()
        return cur.rowcount > 0


# Singleton
database = Database()


def init_db():
    """Initialise the database schema (call once at app startup)."""
    database.init_tables()