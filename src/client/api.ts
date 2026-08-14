/**
 * The slice of the official Web API this page speaks to, declared structurally
 * so the package builds and installs without a harness checkout. Every shape
 * here mirrors a wire type owned by `@deepseek-ai/dsh-host-apiproxy`; widening
 * one of them is how this plugin would silently disagree with the host, so they
 * stay minimal and named after their source.
 */

/** Settings namespace of the multi-provider adapter. */
export const PI_AI_NS = 'llm-pi-ai'

/** Wire envelope shared by every RPC method. */
export interface RpcResponse<T> {
  result:
    | { ok: true; value: T }
    | { ok: false; error: { code?: string; message: string } }
}

/** One configurable provider route, as `llm.providers` reports it. */
export interface ProviderTarget {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: string[]
  /** Whether the route is registered and its models are requestable. */
  active: boolean
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it. Absent means the adapter draws no such distinction, which is
   * not the same as `false` and must never be read as "has a catalog".
   */
  declared?: boolean
}

/** One model an adapter can describe, as `llm.discoverModels` reports it. */
export interface DiscoveredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/** Settings namespace fields this page reads. */
export interface NamespaceView {
  ns: string
  value: unknown
  revision: number
}

/** A single settings mutation, mirroring the official `SettingsPathOpView`. */
export type PathOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] }

/** The API face the operating-window page needs. */
export interface OperatingContextApi {
  llm: {
    providers: (
      request: Record<string, never>,
    ) => Promise<RpcResponse<{ providers: ProviderTarget[] }>>
    discoverModels: (
      request: { settingsNs: string; provider?: string },
    ) => Promise<RpcResponse<{ models: DiscoveredModel[] }>>
  }
  settings: {
    describe: (
      request: Record<string, never>,
    ) => Promise<RpcResponse<{ writable: boolean; namespaces: NamespaceView[] }>>
    mutate: (
      request: { ns: string; ops: PathOp[]; expectedRevision?: number },
    ) => Promise<RpcResponse<NamespaceView>>
  }
}

/**
 * A failure carrying a machine-readable code, so whoever has the dictionary can
 * phrase it. Used for the host's own codes and for the few this plugin raises.
 */
export class CodedError extends Error {
  /** Error code, e.g. `settings-conflict`. */
  readonly code: string | undefined

  /**
   * @param message - a message for a reader who has no dictionary.
   * @param code - the error code when there is one.
   */
  constructor(message: string, code: string | undefined) {
    super(message)
    this.name = 'CodedError'
    this.code = code
  }
}

/**
 * Take the value out of an RPC envelope.
 * @param response - the envelope.
 * @returns the value.
 * @throws CodedError when the host answered with a failure.
 */
export function unwrap<T>(response: RpcResponse<T>): T {
  if (response.result.ok) return response.result.value
  throw new CodedError(response.result.error.message, response.result.error.code)
}
