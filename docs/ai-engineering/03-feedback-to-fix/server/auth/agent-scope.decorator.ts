import { NotFoundException, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Every agent token starts with this, so the auth guard can tell it from a session token. */
export const AGENT_TOKEN_PREFIX = 'fbk_';

export const AGENT_SCOPES = ['feedback:read', 'feedback:write'] as const;
export type AgentTokenScope = (typeof AGENT_SCOPES)[number];

const AGENT_SCOPE_METADATA = 'vatary:agentScope';
const BEARER_PREFIX = 'Bearer ';
const FORBIDDEN_AGENT_METHOD = 'DELETE';

/**
 * Marks a route an agent token may call, and the scope it needs. Closed by
 * default: a route without this decorator answers 404 to an agent token,
 * so a new route is never open to an agent by accident.
 */
export const AgentScope = (scope: AgentTokenScope): MethodDecorator => SetMetadata(AGENT_SCOPE_METADATA, scope);

export function routeAgentScope(context: ExecutionContext): AgentTokenScope | undefined {
  return Reflect.getMetadata(AGENT_SCOPE_METADATA, context.getHandler()) as AgentTokenScope | undefined;
}

/** Throws 404 when the request carries an agent token this route does not accept. */
export function agentTokenOffRoute(context: ExecutionContext): void {
  const request = context.switchToHttp().getRequest<Request>();
  const header = request.headers.authorization;

  if (!header?.startsWith(`${BEARER_PREFIX}${AGENT_TOKEN_PREFIX}`)) {
    return;
  }

  // DELETE is refused whatever the decorators say.
  if (request.method === FORBIDDEN_AGENT_METHOD || !routeAgentScope(context)) {
    throw new NotFoundException();
  }
}
