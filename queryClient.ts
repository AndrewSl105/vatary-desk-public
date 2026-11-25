import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

import { LEGACY_QUERY_CACHE_KEY } from './storage/legacyStorage'
import { registerMutationDefaults } from './mutationDefaults'

const QUERY_STALE_TIME_MS = 30_000
const QUERY_GC_TIME_MS = 24 * 60 * 60 * 1_000
const QUERY_MUTATION_RETRY_COUNT = 0
const QUERY_PERSISTENCE_THROTTLE_MS = 1_000

const QUERY_CACHE_STORAGE_KEY = 'vatary.cache.v1'
const MAX_PERSISTED_TABLE_ROWS = 1_500

const TABLE_QUERY_KEY_ROOT = 'tables'
const TABLE_DOCUMENT_QUERY_KEY = 'doc'

const QUERY_DEFAULT_OPTIONS = {
  queries: {
    staleTime: QUERY_STALE_TIME_MS,
    gcTime: QUERY_GC_TIME_MS,
    refetchOnWindowFocus: false,
  },
  mutations: {
    retry: QUERY_MUTATION_RETRY_COUNT,
    networkMode: 'offlineFirst' as const,
  },
}

type TableDocumentData = {
  data?: {
    sheets?: Array<{
      rows?: unknown[]
    }>
  }
}

export const queryClient = new QueryClient({
  defaultOptions: QUERY_DEFAULT_OPTIONS,
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

  const { sheets } = (data as TableDocumentData | undefined)?.data ?? {}

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

async function adoptLegacyCache(
  storageKey: string,
): Promise<string | null> {
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
  throttleTime: QUERY_PERSISTENCE_THROTTLE_MS,
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
    // IndexedDB may be unavailable, for example in private browsing mode.
  }
}

export async function resetQueryCacheForScopeChange(
  keepKeyRoots: readonly string[] = [],
): Promise<void> {
  try {
    await queryPersister.removeClient()
  } catch {
    // IndexedDB may be unavailable, for example in private browsing mode.
  }

  notifyQueryCacheWipe()

  const preservedQueryKeyRoots = new Set(keepKeyRoots)

  await queryClient.resetQueries({
    predicate: (query) =>
      !preservedQueryKeyRoots.has(String(query.queryKey[0])),
  })
}
