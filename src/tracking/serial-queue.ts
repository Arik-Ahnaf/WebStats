/** Serializes events and commands, preserving arrival order even if reads finish out of order. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    // Failure is still returned to the caller; subsequent events can retry.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
