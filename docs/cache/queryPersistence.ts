const MS_PER_MINUTE = 60_000
const DOC_BODY_CACHE_TTL_MINUTES = 5
const DOC_BODY_CACHE_GC_TIME_MS = DOC_BODY_CACHE_TTL_MINUTES * MS_PER_MINUTE

export const MEMORY_ONLY = { persist: false } as const

export const DOC_BODY_CACHE = {
  gcTime: DOC_BODY_CACHE_GC_TIME_MS,
  meta: MEMORY_ONLY,
} as const

type PersistableQueryMeta = {
  persist?: unknown
}

export function isMemoryOnlyQuery(meta: unknown): boolean {
  return (meta as PersistableQueryMeta | undefined)?.persist === false
}
