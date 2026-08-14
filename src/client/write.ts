/** One settings mutation batch, scoped to the namespace the host accepts. */
export interface WriteBatch<T> {
  ns: string
  payload: T
}

/** The observable outcome of a sequential, non-transactional batch write. */
export type WriteBatchResult =
  | { ok: true; applied: number; total: number }
  | { ok: false; applied: number; total: number; reason: unknown }

/**
 * Apply settings batches in order and retain exact progress when one fails.
 * The host exposes namespace-scoped mutations rather than one transaction, so
 * callers must be able to distinguish a total failure from a partial commit.
 */
export async function writeBatches<T>(
  batches: readonly WriteBatch<T>[],
  write: (batch: WriteBatch<T>) => Promise<void>,
): Promise<WriteBatchResult> {
  let applied = 0
  try {
    for (const batch of batches) {
      await write(batch)
      applied += 1
    }
    return { ok: true, applied, total: batches.length }
  } catch (reason: unknown) {
    return { ok: false, applied, total: batches.length, reason }
  }
}
