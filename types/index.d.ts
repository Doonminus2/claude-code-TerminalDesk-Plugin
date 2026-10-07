export type UndoneKind = 'said' | 'file' | 'task'

export type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type UndoneItem = {
  id: number
  kind: UndoneKind
  text: string
  file?: string
  at: number
}

export type CategoryRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

export type UsageSnapshot = {
  tokens?: number
  window: number
  percent?: number
  usd?: number
  startedAt?: number
  categories: CategoryRow[]
}

export type CacheTtl = '5m' | '1h'

export type CacheState = {
  lastAt: number | null
  ttl: CacheTtl | null
  isObserved: boolean
  readTokens: number
  inputTokens: number
  lastContext: number
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-desk': {
      undone: UndoneItem[]
      tasks: TaskItem[]
      warnLevel: number
      isBandHidden: boolean
      nextId: number
      usage: UsageSnapshot
      cache: CacheState
    }
  }
}
