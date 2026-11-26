/* eslint-disable @typescript-eslint/no-explicit-any */
import { DashboardRpc } from '../rpc'

type SessionLike = {
	id: string
	directory?: string
	location?: { directory?: string } | undefined
	server?: { client?: any } | undefined
}

type RpcOpts = { location?: { directory: string } }

/**
 * Plugin RPC registrations are location-scoped. Calling without a location falls
 * back to the server process cwd and returns HTTP 400 `rpc.unavailable` once the
 * session's project differs (see anomalyco/opencode#58438). Prefer the session's
 * server client so multi-server Desktop tabs hit the right host.
 */
export function dashboardRpc(session: SessionLike, fallbackClient: any) {
	const client = session.server?.client ?? fallbackClient
	const directory = String(session.location?.directory ?? session.directory ?? '').trim()
	const opts: RpcOpts | undefined = directory ? { location: { directory } } : undefined
	const rpc = client.rpc(DashboardRpc)

	return {
		context: (input: { sessionID: string }) => rpc.context(input, opts),
		health: (input: { sessionID: string }) => rpc.health(input, opts),
		hooks: (input: { sessionID: string; limit?: number }) => rpc.hooks(input, opts),
		clearHooks: (input: { sessionID: string }) => rpc.clearHooks(input, opts),
		overview: (input: { sessionID: string }) => rpc.overview(input, opts),
		agents: (input: { sessionID: string }) => rpc.agents(input, opts),
		config: (input: { maxHooks?: number } = {}) => rpc.config(input, opts),
	}
}
