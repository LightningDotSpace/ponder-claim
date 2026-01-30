import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.PREIMAGE_DB_PATH || path.join(process.cwd(), 'preimages.sqlite');

export type PreimageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface PreimageRecord {
  preimageHash: string;
  preimage: string;
  swapId: string | null;
  customerAddress: string | null;
  targetChainId: number | null;
  status: PreimageStatus;
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
        customer_address TEXT,
        target_chain_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      )
    `);

    // Migration: Add new columns if they don't exist
    this.migrateSchema();
  }

  private migrateSchema(): void {
    const tableInfo = this.db.prepare("PRAGMA table_info(registered_preimages)").all() as { name: string }[];
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('customer_address')) {
      this.db.exec('ALTER TABLE registered_preimages ADD COLUMN customer_address TEXT');
    }

    if (!columnNames.includes('target_chain_id')) {
      this.db.exec('ALTER TABLE registered_preimages ADD COLUMN target_chain_id INTEGER');
    }

    if (!columnNames.includes('status')) {
      this.db.exec("ALTER TABLE registered_preimages ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    }
  }

  register(
    preimageHash: string,
    preimage: string,
    swapId?: string,
    customerAddress?: string,
    targetChainId?: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO registered_preimages (preimage_hash, preimage, swap_id, customer_address, target_chain_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
      ON CONFLICT(preimage_hash) DO UPDATE SET
        preimage = excluded.preimage,
        swap_id = excluded.swap_id,
        customer_address = excluded.customer_address,
        target_chain_id = excluded.target_chain_id,
        status = 'pending'
    `);
    stmt.run(
      preimageHash,
      preimage,
      swapId || null,
      customerAddress || null,
      targetChainId || null,
      Math.floor(Date.now() / 1000)
    );
  }

  get(preimageHash: string): PreimageRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT
        preimage_hash as preimageHash,
        preimage,
        swap_id as swapId,
        customer_address as customerAddress,
        target_chain_id as targetChainId,
        status,
        created_at as createdAt
      FROM registered_preimages
      WHERE preimage_hash = ?
    `);
    return stmt.get(preimageHash) as PreimageRecord | undefined;
  }

  /**
   * In-memory cache to track claim status per chain.
   * Key format: `${preimageHash}:${chainId}`
   *
   * This prevents race conditions where multiple lockup events try to claim
   * the same preimage simultaneously on the same chain.
   *
   * NOTE: Different chains can claim independently - e.g., Citrea claim for user
   * and Ethereum claim for Boltz can both proceed for the same preimageHash.
   *
   * The cache is not persistent, but that's OK because:
   * 1. The smart contract prevents double claims ("no tokens locked")
   * 2. After restart, a retry will just fail gracefully and be marked as completed
   */
  private claimStatusCache: Map<string, PreimageStatus> = new Map();

  /**
   * Atomically mark preimage as 'in_progress' for a specific chain.
   * Returns true if successful, false if already in_progress/completed for this chain.
   */
  markInProgress(preimageHash: string, chainId: number): boolean {
    const key = `${preimageHash}:${chainId}`;
    const existing = this.claimStatusCache.get(key);

    if (existing === 'in_progress' || existing === 'completed') {
      return false;
    }

    this.claimStatusCache.set(key, 'in_progress');
    return true;
  }

  /**
   * Mark preimage as completed (successfully claimed) for a specific chain.
   */
  markCompleted(preimageHash: string, chainId: number): void {
    const key = `${preimageHash}:${chainId}`;
    this.claimStatusCache.set(key, 'completed');
  }

  /**
   * Mark preimage as failed (claim failed, can be retried) for a specific chain.
   */
  markFailed(preimageHash: string, chainId: number): void {
    const key = `${preimageHash}:${chainId}`;
    this.claimStatusCache.delete(key);
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
