import type { QueryClient } from '@tanstack/react-query'

import { nodesApi } from '../shared/api/nodesApi'
import { libraryApi, libraryKeys, type LibraryLocaleParam } from '../shared/api/libraryApi'

const NODES_QUERY_ROOT = 'nodes'
const HOME_NODE_KEY = 'home'

const nodeQueryKeys = {
  home: () => [NODES_QUERY_ROOT, HOME_NODE_KEY] as const,
  detail: (id: string) => [NODES_QUERY_ROOT, id] as const,
}

export interface DesktopRouteTarget {
  id: string
  isHome: boolean
}

/** Prefetching is an optimisation: a failure is ignored and the route loads normally. */
function ignoreFailure(task: Promise<unknown>): void {
  void task.catch(() => undefined)
}

/**
 * Warms up a desktop route before navigation, on hover or press: starts
 * the download of the page's lazy chunk and prefetches its data with the
 * same query key the page uses, so it opens with content instead of a
 * skeleton. Safe to call repeatedly: loaded chunks come from the module
 * cache and in-flight queries are deduplicated.
 *
 * The pages are imported dynamically only, with the same specifiers as
 * the router's `lazy()` calls, so both resolve to the same chunk.
 */
export function prefetchDesktopRoute(queryClient: QueryClient, target: DesktopRouteTarget): void {
  if (target.isHome) {
    ignoreFailure(import('./HomePage'))
    ignoreFailure(
      queryClient.prefetchQuery({
        queryKey: nodeQueryKeys.home(),
        queryFn: nodesApi.home,
      }),
    )
    return
  }

  ignoreFailure(import('./NodePage'))
  ignoreFailure(
    queryClient.prefetchQuery({
      queryKey: nodeQueryKeys.detail(target.id),
      queryFn: () => nodesApi.findOne(target.id),
    }),
  )
}

/** Warms up the Library route: its lazy chunk and the section tree for the locale. */
export function prefetchLibraryRoute(queryClient: QueryClient, locale: LibraryLocaleParam): void {
  ignoreFailure(import('./LibraryPage'))
  ignoreFailure(
    queryClient.prefetchQuery({
      queryKey: libraryKeys.tree(locale),
      queryFn: () => libraryApi.tree(locale),
    }),
  )
}
