/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MountedSession, SessionRef } from '@opencode/plugin/gui'
import { GoalRpc, type GoalState } from './goal-rpc'

type StoreSession = SessionRef & {
	visit?: object
	directory?: string
}

export type SessionOverview = {
	sessionID: string
	parentID: string
	forkFrom: string
	title: string
	agent: string
	modelID: string
	providerID: string
	directory: string
	gitBranch: string
	mcp: string[]
	children: string[]
	status: string
	outcome: string
	cost: number
	updatedAt: string
}

export type AgentRow = {
	id: string
	name: string
	description: string
	mode: string
	modelID: string
	providerID: string
	active: boolean
	tools: string[]
	hidden: boolean
}

export type AllowanceMeter = {
	label: string
	percent: number
	limited: boolean
	resetsAt: number
}

export type AllowanceBudget = {
	id: string
	spent: number
	limit: number
	resetsAt: number
	shared: boolean
	scope: string
	per: string
}

export type AllowanceInfo = {
	workspaceName: string
	usageURL: string
	meters: AllowanceMeter[]
	budgets: AllowanceBudget[]
}

export type WaitingKind = 'permission' | 'form' | 'pending'

export type WaitingItem = {
	id: string
	kind: WaitingKind
	title: string
	detail: string
	status?: string
}

function dataOf(session: StoreSession) {
	return session.server?.data
}

/** Sync session + location lists once per visit/key; re-run when location becomes known. */
const syncedByKey = new Map<string, { session: boolean; locationKey: string }>()

export function ensureStoreSynced(session: StoreSession) {
	const data = dataOf(session)
	if (!data) return
	const cacheKey = session.key || session.id
	const location = session.location
	const locationKey = location
		? `${(location as any).directory ?? ''}:${(location as any).workspaceID ?? ''}`
		: ''
	const state = syncedByKey.get(cacheKey) ?? { session: false, locationKey: '' }

	try {
		if (!state.session) {
			void data.session.permission.sync(session.id).catch(() => {})
			void data.session.pending.sync(session.id).catch(() => {})
			state.session = true
		}
		if (location && state.locationKey !== locationKey) {
			void data.session.form.sync(session.id, location).catch(() => {})
			void data.location.vcs.sync(location).catch(() => {})
			void data.location.usage.sync(location).catch(() => {})
			void data.location.agent.sync(location).catch(() => {})
			void data.location.mcp.server.sync(location).catch(() => {})
			state.locationKey = locationKey
		}
		syncedByKey.set(cacheKey, state)
	} catch {
		/* ignore */
	}
}

export function readSessionOverview(session: MountedSession): SessionOverview | undefined {
	const data = dataOf(session)
	if (!data) return undefined
	let info: any
	try {
		info = data.session.get(session.id)
	} catch {
		return undefined
	}
	if (!info) return undefined

	const location = session.location
	let gitBranch = ''
	try {
		const vcs = location ? data.location.vcs.info(location) : undefined
		const current = vcs?.branch?.current
		if (current) gitBranch = String(current)
	} catch {
		/* ignore */
	}

	let mcp: string[] = []
	try {
		const servers = location ? data.location.mcp.server.list(location) : undefined
		if (Array.isArray(servers)) {
			mcp = servers.map((s: any) => String(s?.title || s?.name || '')).filter(Boolean)
		}
	} catch {
		/* ignore */
	}

	let children: string[] = []
	try {
		const family = data.session.family(session.id) ?? []
		children = family.filter((id: string) => id !== session.id)
	} catch {
		/* ignore */
	}

	let status = ''
	try {
		status = String(data.session.status(session.id) || '')
	} catch {
		/* ignore */
	}

	const updated =
		typeof info.time?.updated === 'number'
			? new Date(info.time.updated).toISOString()
			: typeof info.time?.updated === 'string'
				? info.time.updated
				: ''

	return {
		sessionID: session.id,
		parentID: String(info.parentID ?? ''),
		forkFrom: String(info.fork?.sessionID ?? ''),
		title: String(info.title ?? ''),
		agent: String(info.agent ?? ''),
		modelID: String(info.model?.id ?? ''),
		providerID: String(info.model?.providerID ?? ''),
		directory: String(session.directory || info.location?.directory || ''),
		gitBranch,
		mcp,
		children,
		status,
		outcome: String(info.outcome ?? ''),
		cost: Number(info.cost || data.session.cost(session.id) || 0),
		updatedAt: updated,
	}
}

function toolNamesFromAgent(a: any): string[] {
	const rules = Array.isArray(a?.permissions) ? a.permissions : []
	const allowed = new Set<string>()
	for (const rule of rules) {
		const action = String(rule?.action ?? '')
		const effect = String(rule?.effect ?? '').toLowerCase()
		if (!action || effect === 'deny') continue
		if (action.includes('*')) continue
		allowed.add(action)
	}
	return [...allowed].slice(0, 24)
}

export function readAgents(session: StoreSession): AgentRow[] | undefined {
	const data = dataOf(session)
	const location = session.location
	if (!data || !location) return undefined
	let list: any[] | undefined
	try {
		list = data.location.agent.list(location)
	} catch {
		return undefined
	}
	if (!Array.isArray(list)) return undefined

	let activeName = ''
	try {
		activeName = String(data.session.get(session.id)?.agent ?? '')
	} catch {
		/* ignore */
	}

	return list
		.filter((a) => a && !a.hidden)
		.map((a) => {
			const id = String(a.id ?? a.name ?? '')
			const name = String(a.name ?? a.id ?? '')
			return {
				id,
				name,
				description: String(a.description ?? '').slice(0, 220),
				mode: String(a.mode ?? ''),
				modelID: String(a.model?.id ?? ''),
				providerID: String(a.model?.providerID ?? ''),
				active: !!activeName && (id === activeName || name === activeName),
				tools: toolNamesFromAgent(a),
				hidden: !!a.hidden,
			}
		})
}

export function readAllowance(session: StoreSession): AllowanceInfo | null | undefined {
	const data = dataOf(session)
	const location = session.location
	if (!data || !location) return undefined
	let limits: any
	try {
		limits = data.location.usage.limits(location)
	} catch {
		return undefined
	}
	// null = synced, no limits; undefined = not loaded yet
	if (limits === undefined) return undefined
	if (limits == null) return null

	const meters: AllowanceMeter[] = []
	const go = limits.go
	if (go) {
		for (const [label, meter] of [
			['Rolling', go.rolling],
			['Weekly', go.weekly],
			['Monthly', go.monthly],
		] as const) {
			if (!meter) continue
			meters.push({
				label,
				percent: Number(meter.percent) || 0,
				limited: !!meter.limited,
				resetsAt: Number(meter.resetsAt) || 0,
			})
		}
	}

	const budgets: AllowanceBudget[] = Array.isArray(limits.budgets)
		? limits.budgets.map((b: any) => ({
				id: String(b.id ?? ''),
				spent: Number(b.spent) || 0,
				limit: Number(b.limit) || 0,
				resetsAt: Number(b.resetsAt) || 0,
				shared: !!b.shared,
				scope: String(b.scope ?? ''),
				per: String(b.per ?? ''),
			}))
		: []

	if (meters.length === 0 && budgets.length === 0) return null

	return {
		workspaceName: String(limits.workspace?.name || limits.workspace?.id || ''),
		usageURL: String(limits.workspace?.usageURL || ''),
		meters,
		budgets,
	}
}

function inboxText(item: any): string {
	const payload = item?.payload
	if (!payload) return String(item?.type || 'inbox')
	if (typeof payload.text === 'string' && payload.text) return payload.text.slice(0, 120)
	if (typeof payload.description === 'string' && payload.description) {
		return payload.description.slice(0, 120)
	}
	return String(item?.type || 'inbox')
}

export function readWaiting(session: StoreSession): WaitingItem[] {
	const data = dataOf(session)
	if (!data) return []
	const items: WaitingItem[] = []

	try {
		const permissions = data.session.permission.list(session.id) ?? []
		for (const p of permissions) {
			const resources = Array.isArray(p.resources) ? p.resources.join(', ') : ''
			items.push({
				id: `perm:${p.id}`,
				kind: 'permission',
				title: String(p.action || 'permission'),
				detail: resources || String(p.message || ''),
			})
		}
	} catch {
		/* ignore */
	}

	try {
		const forms = data.session.form.list(session.id, session.location) ?? []
		for (const f of forms) {
			items.push({
				id: `form:${f.id}`,
				kind: 'form',
				title: String(f.title || 'form'),
				detail: Array.isArray(f.fields) ? `${f.fields.length} fields` : '',
			})
		}
	} catch {
		/* ignore */
	}

	try {
		const pending = data.session.pending.list(session.id) ?? []
		for (const row of pending) {
			const status = data.session.pending.status(session.id, row.id)
			if (status !== 'queued' && status !== 'stranded') continue
			items.push({
				id: `pending:${row.id}`,
				kind: 'pending',
				title: inboxText(row),
				detail: String(row.type || ''),
				status,
			})
		}
	} catch {
		/* ignore */
	}

	return items
}

export function waitingCount(session: StoreSession): number {
	return readWaiting(session).length
}

export async function fetchGoal(
	rpc: { get: (input: { sessionID: string }) => Promise<unknown> },
	sessionID: string,
): Promise<GoalState | null> {
	try {
		const res = await rpc.get({ sessionID })
		if (!res || typeof res !== 'object') return null
		return res as GoalState
	} catch {
		return null
	}
}

export function subscribeGoal(
	client: { rpc: (def: typeof GoalRpc) => any },
	sessionID: string,
	onChange: (goal: GoalState | null) => void,
): () => void {
	let disposed = false
	let unsub = () => {}
	try {
		const rpc = client.rpc(GoalRpc)
		void fetchGoal(rpc, sessionID).then((goal) => {
			if (!disposed) onChange(goal)
		})
		unsub = rpc.events.on('changed', (event: any) => {
			const data = event?.data ?? event
			if (String(data?.sessionID ?? '') !== sessionID) return
			onChange((data?.goal as GoalState | null) ?? null)
		})
	} catch {
		onChange(null)
	}
	return () => {
		disposed = true
		try {
			unsub()
		} catch {
			/* ignore */
		}
	}
}

export function buildStoreDiagnostics(session: MountedSession, goal: GoalState | null) {
	ensureStoreSynced(session)
	return {
		overview: readSessionOverview(session) ?? null,
		agents: readAgents(session) ?? null,
		allowance: readAllowance(session) ?? null,
		waiting: readWaiting(session),
		goal,
	}
}

/** Drop sync cache for closed session tabs. */
export function forgetStoreSync(sessionKey: string) {
	syncedByKey.delete(sessionKey)
}
