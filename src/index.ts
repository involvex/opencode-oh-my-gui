/* eslint-disable @typescript-eslint/no-explicit-any */
import { Plugin } from '@opencode/plugin'
import { DashboardRpc } from './rpc'

interface HookEntry {
	ts: string
	type: string
	tool: string
	status: string
	summary: string
	sessionID: string
}

interface ContextRow {
	sessionID: string
	parentID: string
	agent: string
	modelID: string
	ctx: number
	input: number
	usable: number
	reserve: number
	user: number
	assistant: number
	reasoning: number
	toolArgs: number
	toolOut: number
	system: number
	toolSchemas: number
	other: number
	source: string
	updatedAt: string
	stale: boolean
}

const MAX_HOOKS = 200
const hookLog: HookEntry[] = []
const sessionAgent = new Map<string, string>()
const sessionModel = new Map<string, { modelID: string; providerID: string }>()
const sessionDir = new Map<string, string>()
const contextRows = new Map<string, ContextRow>()

function now() {
	return new Date().toISOString()
}

function pushHook(entry: HookEntry) {
	hookLog.unshift(entry)
	if (hookLog.length > MAX_HOOKS) hookLog.length = MAX_HOOKS
}

function logErr(label: string, err: unknown) {
	console.error(`[@involvex/oh-my-gui] ${label}:`, err)
}

export default Plugin.define({
	id: '@involvex/oh-my-gui',
	setup(ctx) {
		console.log('[@involvex/oh-my-gui] server plugin initialized')

		const registrations: { dispose?: () => void }[] = []

		// --- session context hook: capture model + a rough context size ---
		try {
			const reg = ctx.session.hook('context', async (c: any) => {
				try {
					const sid = c?.sessionID ?? ''
					if (sid) {
						if (c?.agent) sessionAgent.set(sid, String(c.agent))
						if (c?.model) {
							sessionModel.set(sid, {
								modelID: String(c.model?.id ?? c.model?.modelID ?? ''),
								providerID: String(c.model?.providerID ?? ''),
							})
						}
						// rough token estimate from messages length
						const msgs = Array.isArray(c?.messages) ? c.messages : []
						const sys = Array.isArray(c?.system) ? c.system : []
						const getLen = (v: any): number => {
							if (typeof v === 'string') return v.length
							if (Array.isArray(v)) return v.reduce((a: number, b: any) => a + getLen(b), 0)
							if (v && typeof v === 'object') {
								if (typeof v.content === 'string') return v.content.length
								if (Array.isArray(v.content))
									return v.content.reduce((a: number, b: any) => a + getLen(b), 0)
								if (typeof v.text === 'string') return v.text.length
								if (typeof v.value === 'string') return v.value.length
							}
							return 0
						}
						let user = 0,
							assistant = 0,
							reasoning = 0,
							toolArgs = 0,
							toolOut = 0
						for (const m of msgs) {
							const role = String(m?.role ?? m?.type ?? '').toLowerCase()
							const len = getLen(m)
							if (role.includes('user')) user += len
							else if (role.includes('assistant')) assistant += len
							else if (role.includes('thought') || role.includes('reason')) reasoning += len
							else if (role.includes('tool')) {
								if (role.includes('call') || role.includes('args')) toolArgs += len
								else toolOut += len
							}
						}
						const system = sys.reduce((n: number, s: any) => n + getLen(s), 0)
						const est = getLen(msgs) + system
						const ctxTokens = Math.max(1, Math.round(est / 4))
						const usable = Math.max(ctxTokens, 4096)
						let modelID = String(
							c?.model?.id ?? c?.model?.modelID ?? sessionModel.get(sid)?.modelID ?? '',
						)
						let agent = String(c?.agent ?? sessionAgent.get(sid) ?? '')
						if (
							(!modelID || modelID === 'undefined') &&
							ctx?.session &&
							typeof (ctx.session as any).get === 'function'
						) {
							try {
								const s: any = await (ctx.session as any).get({ sessionID: sid })
								const data = s?.data ?? s
								if (!agent) agent = String(data?.agent ?? data?.agentID ?? '')
								if (!modelID || modelID === 'undefined') {
									modelID = String(data?.model?.id ?? data?.modelID ?? data?.currentModel?.id ?? '')
								}
								if (modelID && modelID !== 'undefined') {
									sessionModel.set(sid, {
										modelID,
										providerID: data?.model?.providerID ?? sessionModel.get(sid)?.providerID ?? '',
									})
								}
								if (agent) sessionAgent.set(sid, agent)
							} catch {}
						}
						contextRows.set(sid, {
							sessionID: sid,
							parentID: '',
							agent: agent || '',
							modelID: modelID || 'unknown',
							ctx: ctxTokens,
							input: ctxTokens,
							usable,
							reserve: Math.round(usable * 0.1),
							user: Math.round(user / 4),
							assistant: Math.round(assistant / 4),
							reasoning: Math.round(reasoning / 4),
							toolArgs: Math.round(toolArgs / 4),
							toolOut: Math.round(toolOut / 4),
							system: Math.round(system / 4),
							toolSchemas: 0,
							other: 0,
							source: 'estimate',
							updatedAt: now(),
							stale: false,
						})
					}
				} catch (err) {
					logErr('context hook handler failed', err)
				}
			})
			registrations.push(reg as any)
		} catch (err) {
			logErr('context hook registration failed', err)
		}

		// --- tool hooks: log ---
		try {
			const reg = ctx.tool.hook('execute.before', (e: any) => {
				pushHook({
					ts: now(),
					type: 'tool.before',
					tool: String(e?.tool ?? ''),
					status: 'pending',
					summary: String(e?.tool ?? ''),
					sessionID: String(e?.sessionID ?? ''),
				})
			})
			registrations.push(reg as any)
		} catch (err) {
			logErr('tool before hook registration failed', err)
		}
		try {
			const reg = ctx.tool.hook('execute.after', (e: any) => {
				pushHook({
					ts: now(),
					type: 'tool.after',
					tool: String(e?.tool ?? ''),
					status: String(e?.status ?? 'completed'),
					summary: String(e?.tool ?? ''),
					sessionID: String(e?.sessionID ?? ''),
				})
			})
			registrations.push(reg as any)
		} catch (err) {
			logErr('tool after hook registration failed', err)
		}

		// --- events ---
		const controller = new AbortController()
		void (async () => {
			try {
				const stream = ctx.event.subscribe({ signal: controller.signal } as any)
				const iterable =
					stream && typeof stream[Symbol.asyncIterator] === 'function' ? stream : null
				if (iterable) {
					for await (const ev of iterable as any) {
						try {
							const e = (ev && (ev.event ?? ev)) ?? ev
							const type = String(e?.type ?? '')
							const sid = String(e?.data?.sessionID ?? e?.sessionID ?? '')
							pushHook({
								ts: now(),
								type: `event:${type}`,
								tool: '',
								status: 'info',
								summary: type,
								sessionID: sid,
							})
							if (type === 'session.created') {
								const parent = e?.data?.parentID
								if (sid && parent) sessionAgent.set(sid, sessionAgent.get(String(parent)) ?? '')
							}
							if (sid && !contextRows.has(sid)) {
								contextRows.set(sid, {
									sessionID: sid,
									parentID: e?.data?.parentID ?? '',
									agent: sessionAgent.get(sid) ?? String(e?.data?.agent ?? ''),
									modelID:
										sessionModel.get(sid)?.modelID ??
										String(e?.data?.model?.id ?? e?.data?.modelID ?? ''),
									ctx: 1,
									input: 1,
									usable: 4096,
									reserve: 409,
									user: 0,
									assistant: 0,
									reasoning: 0,
									toolArgs: 0,
									toolOut: 0,
									system: 0,
									toolSchemas: 0,
									other: 0,
									source: 'event',
									updatedAt: now(),
									stale: false,
								})
							}
						} catch (err) {
							logErr('event handler failed', err)
						}
					}
				}
			} catch (err) {
				if (!controller.signal.aborted) logErr('event stream failed', err)
			}
		})()

		// --- prompt hook: track directory not available; just log ---
		try {
			const reg = ctx.session.hook('prompt', (p: any) => {
				try {
					const sid = String(p?.sessionID ?? '')
					pushHook({
						ts: now(),
						type: 'prompt',
						tool: '',
						status: 'info',
						summary: 'prompt',
						sessionID: sid,
					})
					if (sid && !contextRows.has(sid)) {
						contextRows.set(sid, {
							sessionID: sid,
							parentID: '',
							agent: sessionAgent.get(sid) ?? '',
							modelID: sessionModel.get(sid)?.modelID ?? '',
							ctx: 1,
							input: 1,
							usable: 4096,
							reserve: 409,
							user: 0,
							assistant: 0,
							reasoning: 0,
							toolArgs: 0,
							toolOut: 0,
							system: 0,
							toolSchemas: 0,
							other: 0,
							source: 'prompt',
							updatedAt: now(),
							stale: false,
						})
					}
				} catch (err) {
					logErr('prompt hook handler failed', err)
				}
			})
			registrations.push(reg as any)
		} catch (err) {
			logErr('prompt hook registration failed', err)
		}

		// --- desktop RPC registration ---
		void (async () => {
			try {
				if (!ctx?.rpc || typeof ctx.rpc.register !== 'function') return
				const reg = await ctx.rpc.register(DashboardRpc, {
					overview: async (input: any) => {
						const sid = String(input?.sessionID ?? '')
						const m = sessionModel.get(sid)
						const row = contextRows.get(sid)
						return {
							sessionID: sid,
							data: {
								sessionID: sid,
								parentID: row?.parentID ?? '',
								agent: sessionAgent.get(sid) ?? row?.agent ?? '',
								modelID: m?.modelID ?? row?.modelID ?? '',
								providerID: m?.providerID ?? '',
								directory: sessionDir.get(sid) ?? '',
								gitBranch: '',
								mcp: [],
								todos: 0,
								updatedAt: row?.updatedAt ?? now(),
							},
						}
					},
					agents: async (input: any) => {
						const sid = String(input?.sessionID ?? '')
						const agents: any[] = []
						// best-effort: use ctx.agent if available
						try {
							if (ctx?.agent && typeof ctx.agent.list === 'function') {
								const res: any = await ctx.agent.list()
								const list = Array.isArray(res) ? res : (res?.data ?? res?.agents ?? [])
								for (const a of list) {
									agents.push({
										id: String(a?.id ?? a?.name ?? ''),
										name: String(a?.name ?? a?.id ?? ''),
										modelID: String(a?.model?.id ?? a?.modelID ?? ''),
										providerID: String(a?.model?.providerID ?? a?.providerID ?? ''),
										active: (a?.id ?? a?.name) === (sessionAgent.get(sid) ?? ''),
									})
								}
							}
						} catch (err) {
							logErr('agent list failed', err)
						}
						if (agents.length === 0) {
							// fallback: at least current
							agents.push({
								id: sessionAgent.get(sid) ?? 'default',
								name: sessionAgent.get(sid) ?? 'default',
								modelID: sessionModel.get(sid)?.modelID ?? '',
								providerID: sessionModel.get(sid)?.providerID ?? '',
								active: true,
							})
						}
						return { sessionID: sid, agents }
					},
					context: async (input: any) => {
						const sid = String(input?.sessionID ?? '')
						let row = contextRows.get(sid)
						if (!row) {
							try {
								if (ctx?.session && typeof (ctx.session as any).context === 'function') {
									const res: any = await (ctx.session as any).context({ sessionID: sid })
									const data = res?.data ?? res
									if (data) {
										row = {
											sessionID: sid,
											parentID: data?.parentID ?? '',
											agent: String(data?.agent ?? sessionAgent.get(sid) ?? ''),
											modelID: String(
												data?.model?.id ?? data?.modelID ?? sessionModel.get(sid)?.modelID ?? '',
											),
											ctx: Number(data?.context?.tokens ?? data?.tokens?.context ?? data?.ctx ?? 0),
											input: Number(data?.context?.input ?? data?.input ?? 0),
											usable: Number(data?.context?.usable ?? data?.usable ?? 0),
											reserve: Number(data?.context?.reserve ?? data?.reserve ?? 0),
											user: Number(data?.tokens?.user ?? data?.user ?? 0),
											assistant: Number(data?.tokens?.assistant ?? data?.assistant ?? 0),
											reasoning: Number(data?.tokens?.reasoning ?? data?.reasoning ?? 0),
											toolArgs: Number(data?.tokens?.toolArgs ?? data?.toolArgs ?? 0),
											toolOut: Number(data?.tokens?.toolOut ?? data?.toolOut ?? 0),
											system: Number(data?.tokens?.system ?? data?.system ?? 0),
											toolSchemas: Number(data?.tokens?.toolSchemas ?? data?.toolSchemas ?? 0),
											other: Number(data?.tokens?.other ?? data?.other ?? 0),
											source: 'api',
											updatedAt: now(),
											stale: false,
										}
										contextRows.set(sid, row)
									}
								}
							} catch (err) {
								logErr('context api fetch failed', err)
							}
						}
						if (!row && sid) {
							let modelID = sessionModel.get(sid)?.modelID ?? ''
							let agent = sessionAgent.get(sid) ?? ''
							try {
								if (
									(!modelID || !agent) &&
									ctx?.session &&
									typeof (ctx.session as any).get === 'function'
								) {
									const s: any = await (ctx.session as any).get({ sessionID: sid })
									const data = s?.data ?? s
									if (!agent) agent = String(data?.agent ?? data?.agentID ?? '')
									if (!modelID) {
										modelID = String(
											data?.model?.id ?? data?.modelID ?? data?.currentModel?.id ?? '',
										)
									}
									if (agent) sessionAgent.set(sid, agent)
									if (modelID && !sessionModel.get(sid)?.modelID) {
										sessionModel.set(sid, { modelID, providerID: data?.model?.providerID ?? '' })
									}
								}
							} catch (err) {
								logErr('session get failed', err)
							}
							row = {
								sessionID: sid,
								parentID: '',
								agent,
								modelID: modelID || 'unknown',
								ctx: 1,
								input: 1,
								usable: 4096,
								reserve: 409,
								user: 0,
								assistant: 0,
								reasoning: 0,
								toolArgs: 0,
								toolOut: 0,
								system: 0,
								toolSchemas: 0,
								other: 0,
								source: 'fallback',
								updatedAt: now(),
								stale: false,
							}
							contextRows.set(sid, row)
						} else if (row && (row.modelID === '' || row.modelID === 'unknown')) {
							let modelID = sessionModel.get(sid)?.modelID ?? row.modelID
							let agent = sessionAgent.get(sid) ?? row.agent
							try {
								if (ctx?.session && typeof (ctx.session as any).get === 'function') {
									const s: any = await (ctx.session as any).get({ sessionID: sid })
									const data = s?.data ?? s
									if (!agent || agent === '') agent = String(data?.agent ?? data?.agentID ?? agent)
									if (!modelID || modelID === '' || modelID === 'unknown') {
										modelID = String(
											data?.model?.id ?? data?.modelID ?? data?.currentModel?.id ?? modelID,
										)
									}
									if (agent) sessionAgent.set(sid, agent)
									if (modelID && modelID !== 'unknown' && !sessionModel.get(sid)?.modelID) {
										sessionModel.set(sid, { modelID, providerID: data?.model?.providerID ?? '' })
									}
								}
							} catch (err) {
								logErr('session get failed', err)
							}
							row = {
								...row,
								agent: agent || row.agent,
								modelID: modelID || 'unknown',
								updatedAt: now(),
							}
							contextRows.set(sid, row)
						}
						return { sessionID: sid, rows: row ? [row] : [] }
					},
					hooks: async (input: any) => {
						const sid = String(input?.sessionID ?? '')
						const limit = typeof input?.limit === 'number' ? input.limit : 50
						const filtered = sid
							? hookLog.filter((h) => h.sessionID === sid || h.sessionID === '')
							: hookLog
						return { sessionID: sid, entries: filtered.slice(0, limit) }
					},
				})
				registrations.push(reg as any)
			} catch (err) {
				logErr('desktop RPC registration failed', err)
			}
		})()

		return async () => {
			controller.abort()
			for (const r of registrations) {
				try {
					r?.dispose?.()
				} catch {
					/* ignore */
				}
			}
			console.log('[@involvex/oh-my-gui] plugin cleaned up')
		}
	},
})
