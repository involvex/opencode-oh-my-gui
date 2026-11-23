/* eslint-disable @typescript-eslint/no-explicit-any */

export type StatsRangeId = 'today' | '7d' | '30d'

export type StatsTokens = {
	input: number
	output: number
	reasoning: number
	cacheRead: number
	cacheWrite: number
}

export type StatsToolTotals = {
	calls: number
	succeeded: number
	failed: number
	unfinished: number
}

export type StatsToolRow = StatsToolTotals & {
	name: string
	durationP50?: number
}

export type StatsModelRow = {
	modelID: string
	providerID: string
	steps: number
	cost: number
	tokens: StatsTokens
}

export type StatsSnapshot = {
	from: number
	to: number
	sessions: number
	subagents: number
	prompts: number
	steps: number
	cost: number
	tokens: StatsTokens
	activeDays: number
	streak: number
	activity: { date: string; steps: number }[]
	models: StatsModelRow[]
	toolsMode: 'none' | 'summary' | 'detail'
	toolTotals?: StatsToolTotals
	toolUsage: StatsToolRow[]
}

function startOfLocalDay(d = new Date()) {
	const x = new Date(d)
	x.setHours(0, 0, 0, 0)
	return x.getTime()
}

export function rangeBounds(id: StatsRangeId, now = Date.now()): { from: number; to: number } {
	const to = now
	if (id === 'today') return { from: startOfLocalDay(new Date(now)), to }
	if (id === '7d') return { from: now - 7 * 24 * 60 * 60 * 1000, to }
	return { from: now - 30 * 24 * 60 * 60 * 1000, to }
}

function readTokens(tokens: any): StatsTokens {
	return {
		input: Number(tokens?.input) || 0,
		output: Number(tokens?.output) || 0,
		reasoning: Number(tokens?.reasoning) || 0,
		cacheRead: Number(tokens?.cache?.read) || 0,
		cacheWrite: Number(tokens?.cache?.write) || 0,
	}
}

function normalizeStats(raw: any): StatsSnapshot | null {
	if (!raw || typeof raw !== 'object') return null
	const tools = raw.tools
	const mode = (tools?.mode as StatsSnapshot['toolsMode']) || 'none'
	const toolUsage: StatsToolRow[] = Array.isArray(tools?.usage)
		? tools.usage.map((u: any) => ({
				name: String(u?.name || ''),
				calls: Number(u?.calls) || 0,
				succeeded: Number(u?.succeeded) || 0,
				failed: Number(u?.failed) || 0,
				unfinished: Number(u?.unfinished) || 0,
				durationP50: typeof u?.durationP50 === 'number' ? u.durationP50 : undefined,
			}))
		: []
	const models: StatsModelRow[] = Array.isArray(raw.models)
		? raw.models.map((m: any) => ({
				modelID: String(m?.model?.id || m?.modelID || ''),
				providerID: String(m?.model?.providerID || m?.providerID || ''),
				steps: Number(m?.steps) || 0,
				cost: Number(m?.cost) || 0,
				tokens: readTokens(m?.tokens),
			}))
		: []

	return {
		from: Number(raw.range?.from) || 0,
		to: Number(raw.range?.to) || 0,
		sessions: Number(raw.sessions) || 0,
		subagents: Number(raw.subagents) || 0,
		prompts: Number(raw.prompts) || 0,
		steps: Number(raw.steps) || 0,
		cost: Number(raw.cost) || 0,
		tokens: readTokens(raw.tokens),
		activeDays: Number(raw.activeDays) || 0,
		streak: Number(raw.streak) || 0,
		activity: Array.isArray(raw.activity)
			? raw.activity.map((a: any) => ({
					date: String(a?.date || ''),
					steps: Number(a?.steps) || 0,
				}))
			: [],
		models,
		toolsMode: mode,
		toolTotals:
			tools?.totals && typeof tools.totals === 'object'
				? {
						calls: Number(tools.totals.calls) || 0,
						succeeded: Number(tools.totals.succeeded) || 0,
						failed: Number(tools.totals.failed) || 0,
						unfinished: Number(tools.totals.unfinished) || 0,
					}
				: undefined,
		toolUsage,
	}
}

export async function fetchSessionStats(
	client: any,
	input: {
		from: number
		to: number
		project?: string
		tools?: 'none' | 'summary' | 'detail'
	},
): Promise<{ supported: boolean; data: StatsSnapshot | null }> {
	const timezone = (() => {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone
		} catch {
			return undefined
		}
	})()
	const args = {
		from: input.from,
		to: input.to,
		tools: input.tools ?? 'detail',
		...(input.project ? { project: input.project } : {}),
		...(timezone ? { timezone } : {}),
	}

	const call =
		typeof client?.session?.stats === 'function'
			? () => client.session.stats(args)
			: typeof client?.experimental?.session?.stats === 'function'
				? () => client.experimental.session.stats(args)
				: null

	if (!call) return { supported: false, data: null }

	const res = await call()
	const raw = res?.data ?? res
	return { supported: true, data: normalizeStats(raw) }
}

export function tokenTotal(tokens: StatsTokens) {
	return tokens.input + tokens.output + tokens.reasoning + tokens.cacheRead + tokens.cacheWrite
}
