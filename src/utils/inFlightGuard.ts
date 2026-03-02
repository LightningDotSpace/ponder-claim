export interface TxResult {
  success: boolean;
  txHash?: string;
  swapType?: string;
  error?: string;
}

type InFlightEntry = {
  promise: Promise<TxResult>;
  resolve: (r: TxResult) => void;
};

function createGuard() {
  const inFlight = new Map<string, InFlightEntry>();

  function key(hash: string, chainId: number) {
    return `${hash}:${chainId}`;
  }

  return {
    /**
     * Returns null if this caller is the first (owns the tx).
     * Returns the shared promise if another request is already in-flight.
     */
    acquire(hash: string, chainId: number): Promise<TxResult> | null {
      const k = key(hash, chainId);
      const existing = inFlight.get(k);
      if (existing) return existing.promise;

      let resolve!: (r: TxResult) => void;
      const promise = new Promise<TxResult>((res) => { resolve = res; });
      inFlight.set(k, { promise, resolve });
      return null;
    },

    settle(hash: string, chainId: number, result: TxResult): void {
      const k = key(hash, chainId);
      const entry = inFlight.get(k);
      if (entry) {
        entry.resolve(result);
        inFlight.delete(k);
      }
    },
  };
}

export const claimGuard = createGuard();
export const refundGuard = createGuard();
