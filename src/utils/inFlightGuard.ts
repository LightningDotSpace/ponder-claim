/**
 * Tracks in-flight tx hashes per (preimageHash, chainId).
 * Duplicate requests can wait on the known txHash instead of sending a new tx.
 * Entries are only cleared on success or when the tx is older than STALE_BLOCKS.
 */

const STALE_BLOCKS = 5;

interface InFlightEntry {
  txHash: string;
  blockNumber: number;
}

const inFlight = new Map<string, InFlightEntry>();

function key(hash: string, chainId: number) {
  return `${hash}:${chainId}`;
}

export function getInFlightTxHash(hash: string, chainId: number, currentBlock: number): string | undefined {
  const entry = inFlight.get(key(hash, chainId));
  if (!entry) return undefined;

  if (currentBlock - entry.blockNumber > STALE_BLOCKS) {
    inFlight.delete(key(hash, chainId));
    return undefined;
  }

  return entry.txHash;
}

export function setInFlightTxHash(hash: string, chainId: number, txHash: string, blockNumber: number): void {
  inFlight.set(key(hash, chainId), { txHash, blockNumber });
}

export function clearInFlight(hash: string, chainId: number): void {
  inFlight.delete(key(hash, chainId));
}
