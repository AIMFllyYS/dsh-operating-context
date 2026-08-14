/**
 * Browser half: register the operating-window page on the official Settings
 * shell and keep it in step with the settings document.
 *
 * The context is described structurally rather than imported: the harness
 * packages are resolved from the module table at runtime and are not installed
 * beside this package, so a declaration here is the only place its expectations
 * are written down.
 */
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { OperatingContextSection, type OperatingContextInjected } from './Section.tsx'
import { en, zh, type OperatingContextKey } from './locales.ts'
import { OperatingContextStore } from './store.ts'
import type { OperatingContextApi } from './api.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.operatingContext'

/**
 * Nav position: immediately after Models (10), which is the page a reader comes
 * from, and before Plugins (15).
 */
const ORDER = 12

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote']

/** Function-plugin name for the browser fiber. */
export const name = 'operating-context'

interface ClientContext {
  get: (service: string) => unknown
  effect: (callback: () => (() => void) | void, label: string) => void
  locale: {
    register: (ns: string, dictionaries: { zh: typeof zh; en: typeof en }) => () => void
    bind: (ns: string) => (key: OperatingContextKey) => string
  }
  slots: {
    inject: (slot: string, factory: () => unknown) => void
    register: (
      options: {
        name: string
        id: string
        order: number
        label: () => string
        locale: string
        inject: () => OperatingContextInjected
      },
      component: typeof OperatingContextSection,
    ) => unknown
  }
  remote: {
    $on: (event: string, listener: (...args: unknown[]) => void) => () => void
  }
}

interface ConnectionHandle {
  api: OperatingContextApi
}

/**
 * Register the settings section once `settings.section` is on the ledger.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'operating-context: dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new OperatingContextStore(connection.api)
  const useSnapshot = bindSnapshotSelector(controller.store)
  const t = ctx.locale.bind(NS)
  const injected = (): OperatingContextInjected => ({ controller, useSnapshot, t })

  ctx.effect(() => {
    const refresh = (): void => { controller.refreshIfLoaded() }
    const disposers = [
      ctx.remote.$on('settings/document-updated', refresh),
      ctx.remote.$on('llm/adapters-updated', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'operating-context: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'operating-context',
    order: ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, OperatingContextSection))
}
