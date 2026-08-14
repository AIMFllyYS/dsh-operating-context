/**
 * The platform modules the Web shell resolves at runtime from its module table.
 * They are `external` in the client build and are never installed here, so this
 * file is the only place their surface is written down. Each declaration lists
 * exactly the members this plugin uses: importing anything else from one of
 * them should fail here first, before it fails in a browser.
 */

declare module '@deepseek-ai/dsh-client-runtime/client' {
  /** Writable snapshot store owned by the client runtime. */
  export interface SnapshotStore<T> {
    getSnapshot: () => T
    subscribe: (listener: () => void) => () => void
    update: (mutator: (draft: T) => void) => void
    set: (next: T) => void
  }

  /**
   * Create a snapshot store.
   * @param init - initial state.
   * @param opts - flush mode; `raf` batches, `sync` does not.
   * @returns the store.
   */
  export function createSnapshotStore<T>(
    init: T,
    opts?: { flush?: 'raf' | 'sync' },
  ): SnapshotStore<T>
}

declare module '@deepseek-ai/dsh-client-web-react' {
  /** Selector hook bound to one snapshot source. */
  export type SnapshotSelectorHook<T> =
    <S>(selector: (state: T) => S, equal?: (a: S, b: S) => boolean) => S

  /**
   * Bind a snapshot source to a React selector hook.
   * @param source - anything with `getSnapshot` and `subscribe`.
   * @returns the hook.
   */
  export function bindSnapshotSelector<T>(
    source: { getSnapshot: () => T; subscribe: (listener: () => void) => () => void },
  ): SnapshotSelectorHook<T>
}

declare module '@deepseek-ai/dsh-client-schema-form' {
  /**
   * Read a nested value by path.
   * @param value - root value.
   * @param path - key path from the root; array indexes as decimal strings.
   * @returns the value at the path, or `undefined` along a missing branch.
   */
  export function getPath(value: unknown, path: readonly string[]): unknown
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

  /** Icon props shared by every exported glyph. */
  export interface IconProps {
    size?: number | undefined
    className?: string | undefined
  }

  /**
   * Capsule button.
   * @param props - variant, size, and native button attributes.
   * @returns the button.
   */
  export function Button(
    props: {
      variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
      size?: 'md' | 'sm'
      icon?: ReactNode
      className?: string
    } & ButtonHTMLAttributes<HTMLButtonElement>,
  ): ReactNode

  /**
   * Single-line text field.
   * @param props - optional leading icon and native input attributes.
   * @returns the field.
   */
  export function Input(
    props: { icon?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>,
  ): ReactNode

  /**
   * Selectable chip. Renders a button when `onClick` is present, else a span.
   * @param props - selected state and native button attributes.
   * @returns the chip.
   */
  export function Pill(
    props: {
      active?: boolean
      className?: string | undefined
    } & ButtonHTMLAttributes<HTMLButtonElement>,
  ): ReactNode

  /**
   * Row that expands to reveal its children.
   * @param props - row content and open state.
   * @returns the row.
   */
  export function DisclosureRow(
    props: {
      icon: ReactNode
      title: string
      open: boolean
      expandable: boolean
      onToggle: () => void
      expandOnRowClick?: boolean
      children?: ReactNode
      className?: string | undefined
      titleClassName?: string | undefined
    },
  ): ReactNode

  /**
   * Downward chevron, 14px.
   * @param props - icon size and class.
   * @returns the glyph.
   */
  export function IconChevronDownOutline14(props: IconProps): ReactNode
}
