type QueueItem = {
  execute: () => Promise<void>;
};

class ChainTransactionQueue {
  private readonly queue: QueueItem[] = [];
  private processing = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await item.execute();
    }

    this.processing = false;
  }
}

/**
 * Chain-specific transaction queues to prevent nonce conflicts.
 * Each chain has its own queue since nonces are independent per chain.
 */
class TransactionQueueManager {
  private readonly queues = new Map<number, ChainTransactionQueue>();

  getQueue(chainId: number): ChainTransactionQueue {
    if (!this.queues.has(chainId)) {
      this.queues.set(chainId, new ChainTransactionQueue());
    }
    return this.queues.get(chainId)!;
  }

  async enqueue<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
    return this.getQueue(chainId).enqueue(fn);
  }
}

export const transactionQueue = new TransactionQueueManager();
