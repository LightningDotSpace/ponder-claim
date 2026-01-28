import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.PREIMAGE_DB_PATH || path.join(process.cwd(), 'preimages.sqlite');

interface PreimageRecord {
  preimageHash: string;
  preimage: string;
  swapId: string | null;
  createdAt: number;
}

class PreimageStore {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.init();
  }

  private init(): void {
    // Enable WAL mode for better concurrent read/write performance
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registered_preimages (
        preimage_hash TEXT PRIMARY KEY,
        preimage TEXT NOT NULL,
        swap_id TEXT,
        created_at INTEGER NOT NULL
      )
    `);
  }

  register(preimageHash: string, preimage: string, swapId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO registered_preimages (preimage_hash, preimage, swap_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(preimage_hash) DO UPDATE SET
        preimage = excluded.preimage,
        swap_id = excluded.swap_id
    `);
    stmt.run(preimageHash, preimage, swapId || null, Math.floor(Date.now() / 1000));
  }

  get(preimageHash: string): PreimageRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT preimage_hash as preimageHash, preimage, swap_id as swapId, created_at as createdAt
      FROM registered_preimages
      WHERE preimage_hash = ?
    `);
    return stmt.get(preimageHash) as PreimageRecord | undefined;
  }

  delete(preimageHash: string): void {
    const stmt = this.db.prepare('DELETE FROM registered_preimages WHERE preimage_hash = ?');
    stmt.run(preimageHash);
  }
}

let preimageStore: PreimageStore | null = null;

export function getPreimageStore(): PreimageStore {
  if (!preimageStore) {
    preimageStore = new PreimageStore();
  }
  return preimageStore;
}
