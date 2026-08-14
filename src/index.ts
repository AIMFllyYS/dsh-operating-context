/**
 * Host half of a browser-only plugin. The page, its state, and its settings
 * writes all live in the client bundle (`./client`); this entry exists because
 * the Loader row is what makes the package active, and the client-module scan
 * only reaches packages the profile loaded.
 */

/** Function-plugin id (Loader row id is `operating-context`). */
export const name = 'operating-context'

/**
 * Claim the Loader row without contributing Host behavior.
 */
export function apply(): void {
  // No Host contribution: the operating window is written through the official
  // settings RPC from the browser, so nothing here would have a second reader.
}
