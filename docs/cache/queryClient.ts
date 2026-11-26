import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

import { LEGACY_QUERY_CACHE_KEY } from './storage/legacyStorage'
import { registerMutationDefaults } from './mutationDefaults'

const MS_PER_SECOND = 1_000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

const QUERY_STALE_TIME_MS = 30 * MS_PER_SECOND
const QUERY_GC_TIME_MS = MS_PER_DAY
const MUTATION_RETRY_COUNT = 0
const PERSISTENCE_THROTTLE_MS = MS_PER_SECOND

const QUERY_CACHE_STORAGE_KEY = 'vatary.cache.v1'
const MAX_PERSISTED_TABLE_ROWS = 1_500

const TABLE_QUERY_KEY_ROOT = 'tables'
const TABLE_DOCUMENT_QUERY_KEY = 'doc'

type TableDocumentData = {
  data?: {
    sheets?: Array<{
      rows?: unknown[]
    }>
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      gcTime: QUERY_GC_TIME_MS,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: MUTATION_RETRY_COUNT,
      networkMode: 'offlineFirst',
    },
  },
})

registerMutationDefaults(queryClient)

export function isLargeTableDocQuery(
  queryKey: readonly unknown[],
  data: unknown,
): boolean {
  const isTableDocumentQuery =
    queryKey[0] === TABLE_QUERY_KEY_ROOT &&
    queryKey[1] === TABLE_DOCUMENT_QUERY_KEY

  if (!isTableDocumentQuery) {
    return false
  }

  const sheets = (data as TableDocumentData | undefined)?.data?.sheets

  if (!Array.isArray(sheets)) {
    return false
  }

  let totalRows = 0

  for (const sheet of sheets) {
    totalRows += Array.isArray(sheet?.rows) ? sheet.rows.length : 0

    if (totalRows > MAX_PERSISTED_TABLE_ROWS) {
      return true
    }
  }

  return false
}

async function adoptLegacyCache(storageKey: string): Promise<string | null> {
  const legacyCache = await get<string>(LEGACY_QUERY_CACHE_KEY)

  if (legacyCache === undefined) {
    return null
  }

  await set(storageKey, legacyCache)
  await del(LEGACY_QUERY_CACHE_KEY)

  return legacyCache
}

export const queryPersister = createAsyncStoragePersister({
  key: QUERY_CACHE_STORAGE_KEY,
  storage: {
    getItem: async (key) =>
      (await get<string>(key)) ?? (await adoptLegacyCache(key)),
    setItem: async (key, value) => {
      await set(key, value)
    },
    removeItem: async (key) => {
      await del(key)
    },
  },
  throttleTime: PERSISTENCE_THROTTLE_MS,
})

const queryCacheWipeListeners = new Set<() => void>()

export function onQueryCacheWipe(listener: () => void): () => void {
  queryCacheWipeListeners.add(listener)

  return () => {
    queryCacheWipeListeners.delete(listener)
  }
}

function notifyQueryCacheWipe(): void {
  for (const listener of [...queryCacheWipeListeners]) {
    listener()
  }
}

export async function purgeQueryCache(): Promise<void> {
  queryClient.clear()
  notifyQueryCacheWipe()

  try {
    await queryPersister.removeClient()
    await del(LEGACY_QUERY_CACHE_KEY)
  } catch {
    // Persistent storage is unavailable; the in-memory cache is already cleared.
  }
}

export async function resetQueryCacheForScopeChange(
  keepKeyRoots: readonly string[] = [],
): Promise<void> {
  try {
    await queryPersister.removeClient()
  } catch {
    // Persistent storage is unavailable; there is no stored snapshot to remove.
  }

  notifyQueryCacheWipe()

  const preservedQueryKeyRoots = new Set(keepKeyRoots)

  await queryClient.resetQueries({
    predicate: (query) => !preservedQueryKeyRoots.has(String(query.queryKey[0])),
  })
}
