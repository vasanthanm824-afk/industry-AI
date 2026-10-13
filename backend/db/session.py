"""
Database Session & Connection Management
Supports SQLite by default and is easily swappable to PostgreSQL via DATABASE_URL.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Default SQLite database path
DEFAULT_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "safety_system.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for providing transactional database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and run lightweight migrations."""
    # Ensure parent directory for sqlite file exists
    if DATABASE_URL.startswith("sqlite:///"):
        db_file = DATABASE_URL.replace("sqlite:///", "")
        os.makedirs(os.path.dirname(db_file), exist_ok=True)
    Base.metadata.create_all(bind=engine)

    # Safe SQLite column migration for workers.allocated_manager
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            # Check existing columns in workers table
            result = conn.execute(text("PRAGMA table_info(workers)")).fetchall()
            col_names = [r[1] for r in result]
            if "allocated_manager" not in col_names and len(col_names) > 0:
                conn.execute(text("ALTER TABLE workers ADD COLUMN allocated_manager VARCHAR(128) DEFAULT 'Unassigned'"))
                conn.commit()

            # Ensure optimal indexes for fast queries and duplicate-prevention
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_workers_worker_id ON workers(worker_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_worker_date ON attendance(worker_id, date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp)"))
            conn.commit()
    except Exception as e:
        # Non-critical if table doesn't exist yet or already indexed
        pass
