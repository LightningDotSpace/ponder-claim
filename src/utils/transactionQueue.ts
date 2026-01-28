type QueueItem = {
  execute: () => Promise<void>;
};

class TransactionQueue {
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

export const transactionQueue = new TransactionQueue();
