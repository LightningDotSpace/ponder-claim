/**
 * Tracks in-flight tx hashes per (preimageHash, chainId).
 * Duplicate requests can wait on the known txHash instead of sending a new tx.
 */
const inFlight = new Map<string, string>();

function key(hash: string, chainId: number) {
  return `${hash}:${chainId}`;
}

export function getInFlightTxHash(hash: string, chainId: number): string | undefined {
  return inFlight.get(key(hash, chainId));
}

export function setInFlightTxHash(hash: string, chainId: number, txHash: string): void {
  inFlight.set(key(hash, chainId), txHash);
}

export function clearInFlight(hash: string, chainId: number): void {
  inFlight.delete(key(hash, chainId));
}
