import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AgentTokenService } from './agent-token.service';
import { AGENT_TOKEN_PREFIX, agentTokenOffRoute, routeAgentScope } from './agent-scope.decorator';

/** What the auth guard attaches to a request authenticated by an agent token. */
export interface AgentRequestFields {
  authUser?: { sub: string; email: string; name?: string; raw: Record<string, never> };
  agentToken?: { id: string; scopes: string[] };
}

export function isAgentToken(bearer: string): boolean {
  return bearer.startsWith(AGENT_TOKEN_PREFIX);
}

/**
 * The agent-token branch of the auth guard. The route check comes first,
 * so a route an agent may not use answers 404 for any agent token, valid
 * or not. An agent token never impersonates a user and never counts as the
 * person being active.
 */
export async function authenticateAgent(
  context: ExecutionContext,
  request: Request & AgentRequestFields,
  token: string,
  agentTokens: Pick<AgentTokenService, 'resolve'>,
): Promise<true> {
  agentTokenOffRoute(context);

  const agent = await agentTokens.resolve(token);
  if (!agent) {
    throw new UnauthorizedException('Invalid token');
  }

  const requiredScope = routeAgentScope(context);
  if (!requiredScope || !agent.scopes.includes(requiredScope)) {
    throw new ForbiddenException('Token lacks the scope for this route');
  }

  request.authUser = agent.user;
  request.agentToken = { id: agent.id, scopes: agent.scopes };
  return true;
}
