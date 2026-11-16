import { lastAssistantWithUsage } from '@opencode/client/solid'
import type { MountedSession } from '@opencode/plugin/gui'

const RESERVE_SHARE = 0.1
const RESERVE_MIN = 16000

/** Mirror of opencode core's compaction reserve: max(10% of window, 16k for windows >= 32k). */
export function reserveFor(window: number) {
	return Math.max(Math.floor(window * RESERVE_SHARE), window >= 2 * RESERVE_MIN ? RESERVE_MIN : 0)
}

export type CompactionRisk = 'low' | 'medium' | 'high' | 'unknown'

export type SessionUsage = {
	tokens: number
	usable: number
	reserve: number
	limit: number
	cost: number
	share: number | null
	risk: CompactionRisk
	modelID: string
	providerID: string
	agent: string
	source: 'usage'
	input: number
	output: number
	reasoning: number
	cacheRead: number
	cacheWrite: number
}

function totalTokens(tokens: {
	input: number
	output: number
	reasoning: number
	cache: { read: number; write: number }
}) {
	return tokens.input + tokens.output + tokens.reasoning + (tokens.cache?.read ?? 0)
}

function riskFor(share: number | null): CompactionRisk {
	if (share == null) return 'unknown'
	if (share >= 90) return 'high'
	if (share >= 70) return 'medium'
	return 'low'
}

/**
 * Official context usage for a mounted session: same store as the desktop header ring.
 * Returns undefined when there is no assistant step (or session totals) with tokens yet.
 */
export function readSessionUsage(session: MountedSession): SessionUsage | undefined {
	try {
		const data = session.server?.data
		if (!data) return undefined
		const info = data.session.get(session.id)
		if (!info) return undefined

		const messages = data.session.message.list(session.id)
		const step = lastAssistantWithUsage(messages, info.revert?.messageID)
		const tokens = step?.tokens ?? (totalTokens(info.tokens) > 0 ? info.tokens : undefined)
		if (!tokens) return undefined

		const used = totalTokens(tokens)
		const modelRef = step?.model ?? info.model
		let modelID = String(modelRef?.id ?? '')
		let providerID = String(modelRef?.providerID ?? '')
		let limit = 0
		let usable = 0
		let reserve = 0

		const location = session.location
		if (location && modelRef) {
			const models = data.location.model.list(location) ?? []
			const model =
				models.find((m) => m.id === modelRef.id && m.providerID === modelRef.providerID) ??
				models.find((m) => m.modelID === modelRef.id || m.id === modelRef.id)
			const lim = model?.limit
			if (lim) {
				const input = typeof lim.input === 'number' && lim.input > 0 ? lim.input : null
				const context = typeof lim.context === 'number' && lim.context > 0 ? lim.context : null
				const window = input ?? context
				if (window && window > 0) {
					limit = window
					reserve = reserveFor(window)
					usable = Math.max(0, window - reserve)
				}
				if (!modelID) modelID = String(model?.modelID ?? model?.id ?? '')
				if (!providerID) providerID = String(model?.providerID ?? '')
			}
		}

		const cost = Number(data.session.cost(session.id) || 0)
		const share = usable > 0 ? (used / usable) * 100 : null

		return {
			tokens: used,
			usable,
			reserve,
			limit,
			cost,
			share,
			risk: riskFor(share),
			modelID,
			providerID,
			agent: String(step?.agent ?? info.agent ?? ''),
			source: 'usage',
			input: tokens.input,
			output: tokens.output,
			reasoning: tokens.reasoning,
			cacheRead: tokens.cache?.read ?? 0,
			cacheWrite: tokens.cache?.write ?? 0,
		}
	} catch {
		return undefined
	}
}

export function formatTokens(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
	return String(Math.round(n))
}

export function formatCost(usd: number) {
	if (!Number.isFinite(usd) || usd <= 0) return '$0.00'
	if (usd < 0.01) return `$${usd.toFixed(4)}`
	return `$${usd.toFixed(2)}`
}
