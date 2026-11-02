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
					console.log(
						'[@involvex/oh-my-gui] context hook fired, keys:',
						Object.keys(c ?? {}),
						'msgs:',
						Array.isArray(c?.messages) ? c.messages.length : 'n/a',
						'sid:',
						c?.sessionID,
					)
					if (Array.isArray(c?.messages) && c.messages.length > 0) {
						const m0 = c.messages[0]
						console.log(
							'[@involvex/oh-my-gui] first msg keys:',
							Object.keys(m0 ?? {}),
							'role:',
							m0?.role,
							'content type:',
							typeof m0?.content,
							Array.isArray(m0?.content) ? m0.content.length : m0?.content,
						)
						if (Array.isArray(m0?.content) && m0.content.length > 0) {
							console.log(
								'[@involvex/oh-my-gui] first part:',
								JSON.stringify(m0.content[0]).slice(0, 300),
							)
						}
					}
					if (c?.system)
						console.log(
							'[@involvex/oh-my-gui] system type:',
							typeof c.system,
							Array.isArray(c.system) ? c.system.length : c.system,
						)
					const sid = String(
						c?.sessionID ?? c?.session?.id ?? c?.data?.sessionID ?? c?.sessionId ?? '',
					)
					if (sid) {
						if (c?.agent) sessionAgent.set(sid, String(c.agent))
						if (c?.model) {
							sessionModel.set(sid, {
								modelID: String(c.model?.id ?? c.model?.modelID ?? ''),
								providerID: String(c.model?.providerID ?? ''),
							})
						}
						// estimate breakdown like opencode-context-indicator
						const CHARS_PER_TOKEN_OTHER = 4
						const CHARS_PER_TOKEN_CYRILLIC = 2.5
						const CHARS_PER_TOKEN_CJK = 1.5
						const estimateTokens = (text: any): number => {
							if (!text) return 0
							const s = typeof text === 'string' ? text : String(text)
							const len = s.length
							if (len === 0) return 0
							let other = 0,
								cyr = 0,
								cjk = 0
							for (let i = 0; i < len; i++) {
								const cp = s.codePointAt(i) ?? 0
								if (cp > 0xffff) i++
								if (cp < 0x80) other++
								else if (
									(cp >= 0x0400 && cp <= 0x04ff) ||
									(cp >= 0x0500 && cp <= 0x052f) ||
									(cp >= 0x2de0 && cp <= 0x2dff) ||
									(cp >= 0xa640 && cp <= 0xa69f) ||
									(cp >= 0x1c80 && cp <= 0x1c8f)
								)
									cyr++
								else if (
									(cp >= 0x4e00 && cp <= 0x9fff) ||
									(cp >= 0x3400 && cp <= 0x4dbf) ||
									(cp >= 0xf900 && cp <= 0xfaff) ||
									(cp >= 0x3040 && cp <= 0x30ff) ||
									(cp >= 0xac00 && cp <= 0xd7af) ||
									(cp >= 0x3000 && cp <= 0x303f) ||
									(cp >= 0xff00 && cp <= 0xffef)
								)
									cjk++
								else other++
							}
							return Math.round(
								other / CHARS_PER_TOKEN_OTHER +
									cyr / CHARS_PER_TOKEN_CYRILLIC +
									cjk / CHARS_PER_TOKEN_CJK,
							)
						}
						const estJson = (value: any): number => {
							if (value == null) return 0
							try {
								return estimateTokens(JSON.stringify(value))
							} catch {
								return 0
							}
						}
						const msgs = Array.isArray(c?.messages)
							? c.messages
							: Array.isArray(c?.message)
								? c.message
								: Array.isArray(c?.input?.messages)
									? c.input.messages
									: Array.isArray(c?.request?.messages)
										? c.request.messages
										: []
						const sys = Array.isArray(c?.system)
							? c.system
							: Array.isArray(c?.systemPrompt)
								? c.systemPrompt
								: Array.isArray(c?.system_prompt)
									? c.system_prompt
									: typeof c?.system === 'string'
										? [{ text: c.system }]
										: []
						const genericLen = (v: any): number => {
							if (v == null) return 0
							if (typeof v === 'string') return v.length
							if (Array.isArray(v)) return v.reduce((a: number, b: any) => a + genericLen(b), 0)
							if (typeof v === 'object') {
								let n = 0
								for (const k of Object.keys(v)) {
									if (k === 'id' || k === 'type' || k === 'role' || k === 'time') continue
									n += genericLen((v as any)[k])
								}
								return n
							}
							return 0
						}
						let user = 0,
							assistant = 0,
							reasoning = 0,
							toolArgs = 0,
							toolOut = 0
						for (const m of msgs) {
							const parts = Array.isArray(m?.content)
								? m.content
								: Array.isArray(m?.parts)
									? m.parts
									: typeof m?.content === 'string'
										? [{ type: 'text', text: m.content }]
										: []
							const role = String(m?.role ?? m?.type ?? m?.author ?? '').toLowerCase()
							for (const p of parts) {
								const ptype = String(p?.type ?? '').toLowerCase()
								if (
									ptype === 'tool-result' ||
									ptype === 'tool_result' ||
									ptype.includes('tool-result')
								) {
									toolOut += estimateTokens(
										typeof p?.text === 'string'
											? p.text
											: typeof p?.content === 'string'
												? p.content
												: JSON.stringify(p?.output ?? p?.result ?? p?.value ?? ''),
									)
									continue
								}
								if (role.includes('user')) {
									if (ptype === 'text' || ptype === 'input_text')
										user += estimateTokens(p.text ?? p.content ?? '')
								} else {
									if (ptype === 'text' || ptype === 'output_text')
										assistant += estimateTokens(p.text ?? p.content ?? '')
									else if (ptype === 'reasoning' || ptype === 'thought')
										reasoning += estimateTokens(p.text ?? p.content ?? '')
									else if (
										ptype === 'tool-call' ||
										ptype === 'tool_call' ||
										ptype === 'function-call' ||
										ptype.includes('tool-call')
									)
										toolArgs += estJson(p.input ?? p.args ?? p.arguments)
								}
							}
							if (parts.length === 0) {
								const len = genericLen(m)
								if (role.includes('user')) user += Math.round(len / 4)
								else assistant += Math.round(len / 4)
							}
						}
						let system = 0
						for (const s of sys) system += estimateTokens(s?.text ?? s)
						let toolSchemas = 0
						const tools = c?.tools
						if (tools && typeof tools === 'object') {
							for (const t of Object.values(tools)) {
								toolSchemas += estimateTokens((t as any)?.description) + estJson((t as any)?.input)
							}
						}
						let ctxTokens = user + assistant + reasoning + toolArgs + toolOut + system + toolSchemas
						if (ctxTokens === 0) {
							let est = genericLen(msgs) + genericLen(sys) + genericLen(c?.tools)
							if (est === 0) est = genericLen(c)
							ctxTokens = Math.max(1, Math.round(est / 4))
						}
						if (ctxTokens < 1) ctxTokens = 1
						// ensure at least one category reflects the total
						const catSum = user + assistant + reasoning + toolArgs + toolOut + system + toolSchemas
						let other = 0
						if (catSum === 0 && ctxTokens > 0) other = ctxTokens
						else if (catSum < ctxTokens) other = ctxTokens - catSum
						const usable = Math.max(ctxTokens, 4096)
						const modelID = String(
							c?.model?.id ?? c?.model?.modelID ?? sessionModel.get(sid)?.modelID ?? '',
						)
						const agent = String(c?.agent ?? sessionAgent.get(sid) ?? '')
						if (c?.model) {
							sessionModel.set(sid, {
								modelID: String(c.model?.id ?? c.model?.modelID ?? ''),
								providerID: String(c.model?.providerID ?? ''),
							})
						}
						if (c?.agent) sessionAgent.set(sid, String(c.agent))
						contextRows.set(sid, {
							sessionID: sid,
							parentID: '',
							agent: agent || '',
							modelID: modelID || 'unknown',
							ctx: ctxTokens,
							input: ctxTokens,
							usable,
							reserve: Math.round(usable * 0.1),
							user,
							assistant,
							reasoning,
							toolArgs,
							toolOut,
							system,
							toolSchemas,
							other,
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
						// If no row or empty measurement, try to build one from session messages
						if (!row || (row.ctx ?? 0) <= 1) {
							try {
								if (ctx?.session && typeof (ctx.session as any).context === 'function') {
									const res: any = await (ctx.session as any).context({ sessionID: sid })
									const msgs = Array.isArray(res)
										? res
										: Array.isArray(res?.data)
											? res.data
											: Array.isArray(res?.messages)
												? res.messages
												: []
									if (msgs.length > 0) {
										const genericLen = (v: any): number => {
											if (v == null) return 0
											if (typeof v === 'string') return v.length
											if (Array.isArray(v))
												return v.reduce((a: number, b: any) => a + genericLen(b), 0)
											if (typeof v === 'object') {
												let n = 0
												for (const k of Object.keys(v)) {
													if (
														k === 'id' ||
														k === 'type' ||
														k === 'role' ||
														k === 'time' ||
														k === 'metadata'
													)
														continue
													n += genericLen((v as any)[k])
												}
												return n
											}
											return 0
										}
										const totalChars = msgs.reduce((a: number, m: any) => a + genericLen(m), 0)
										const ctxTokens = Math.max(1, Math.round(totalChars / 4))
										row = {
											sessionID: sid,
											parentID: '',
											agent: sessionAgent.get(sid) ?? '',
											modelID: sessionModel.get(sid)?.modelID ?? 'unknown',
											ctx: ctxTokens,
											input: ctxTokens,
											usable: Math.max(ctxTokens, 4096),
											reserve: Math.round(Math.max(ctxTokens, 4096) * 0.1),
											user: 0,
											assistant: 0,
											reasoning: 0,
											toolArgs: 0,
											toolOut: 0,
											system: 0,
											toolSchemas: 0,
											other: ctxTokens,
											source: 'session-messages',
											updatedAt: now(),
											stale: false,
										}
										contextRows.set(sid, row)
									}
								}
							} catch (err) {
								logErr('session context fetch failed', err)
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
