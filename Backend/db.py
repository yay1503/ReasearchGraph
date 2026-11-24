from pathlib import Path
import aiosqlite

DB_PATH = Path(__file__).resolve().parent.parent / "database" / "researchgraph.db"

async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA foreign_keys = ON;")
        yield db