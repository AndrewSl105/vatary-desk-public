import type { QueryClient } from '@tanstack/react-query'

import { refreshDeskAiStatus } from './deskAi/useDeskAi'
import { nodesApi, type SaveDashboardInput } from './api/nodesApi'

export const MUTATION_KEYS = {
  saveDashboard: ['saveDashboard'],
} as const

export interface SaveDashboardVariables {
  nodeId: string
  input: SaveDashboardInput
}

async function saveDashboard(
  client: QueryClient,
  variables: SaveDashboardVariables,
) {
  const { nodeId, input } = variables
  const savedDashboard = await nodesApi.saveDashboard(nodeId, input)

  if (input.layout) {
    refreshDeskAiStatus(client, nodeId)
  }

  return savedDashboard
}

export function registerMutationDefaults(client: QueryClient): void {
  client.setMutationDefaults(MUTATION_KEYS.saveDashboard, {
    mutationFn: (variables: unknown) =>
      saveDashboard(client, variables as SaveDashboardVariables),
  })
}
