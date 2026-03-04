/**
 * Tracks in-flight tx hashes per (preimageHash, chainId).
 * Duplicate requests can wait on the known txHash instead of sending a new tx.
 * Entries expire after 1 hour.
 */

const TTL_MS = 60 * 60 * 1000;

interface InFlightEntry {
  txHash: string;
  createdAt: number;
}

const inFlight = new Map<string, InFlightEntry>();

function key(hash: string, chainId: number) {
  return `${hash}:${chainId}`;
}

export function getInFlightTxHash(hash: string, chainId: number): string | undefined {
  const entry = inFlight.get(key(hash, chainId));
  if (!entry) return undefined;

  if (Date.now() - entry.createdAt > TTL_MS) {
    inFlight.delete(key(hash, chainId));
    return undefined;
  }

  return entry.txHash;
}

export function setInFlightTxHash(hash: string, chainId: number, txHash: string): void {
  inFlight.set(key(hash, chainId), { txHash, createdAt: Date.now() });
}

export function clearInFlight(hash: string, chainId: number): void {
  inFlight.delete(key(hash, chainId));
}
