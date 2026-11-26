/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { dashboardRpc } from './dashboard-rpc'
import { createSessionPoll } from './poll'
import { SERIES, pctTone, tok } from './tokens'
import { formatCost, formatTokens, readCompaction, readSessionUsage } from './usage'
import { ensureStoreSynced, readAllowance } from './session-store'

const CARD = {
	display: 'flex',
	'flex-direction': 'column',
	gap: '8px',
	padding: '10px',
	'border-radius': '8px',
	border: `1px solid ${tok.border}`,
	'background-color': tok.surface,
} as const

const TRACK = {
	width: '100%',
	'border-radius': '999px',
	'background-color': tok.track,
	overflow: 'hidden',
} as const

export function ContextView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [rows, setRows] = createSignal<any[]>([])
	const [health, setHealth] = createSignal<any>(null)
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [lastOk, setLastOk] = createSignal('')
	const [failures, setFailures] = createSignal(0)
	const [refreshing, setRefreshing] = createSignal(false)

	const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
		let timer: ReturnType<typeof setTimeout> | undefined
		try {
			return await Promise.race([
				promise,
				new Promise<T>((_, reject) => {
					timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
				}),
			])
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	const refreshNow = async (
		sessionID: string,
		disposed: () => boolean,
	): Promise<'ok' | 'error' | 'skipped'> => {
		if (disposed()) return 'skipped'
		if (refreshing()) return 'skipped'
		setRefreshing(true)
		try {
			const rpc = dashboardRpc(props.session, ctx.client)
			const result = (await withTimeout(rpc.context({ sessionID }), 8000)) as {
				rows?: unknown
			}
			if (disposed()) return 'skipped'
			setRows(Array.isArray(result.rows) ? result.rows : [])
			const h = (await rpc.health({ sessionID }).catch(() => null)) as {
				data?: unknown
			} | null
			if (disposed()) return 'skipped'
			setHealth(h?.data ?? null)
			setError('')
			setFailures(0)
			setLastOk(new Date().toISOString())
			return 'ok'
		} catch (err) {
			if (disposed()) return 'skipped'
			setFailures((n) => n + 1)
			setError(err instanceof Error ? err.message : String(err))
			return 'error'
		} finally {
			setRefreshing(false)
			if (!disposed()) setLoaded(true)
		}
	}

	createSessionPoll({
		sessionID: () => props.session.id,
		reset: () => {
			setRefreshing(false)
			setLoaded(false)
			setRows([])
			setError('')
			setFailures(0)
			setLastOk('')
		},
		intervalMs: () => Number((ctx.stores.prefs.value as any).pollMs) || 5000,
		tick: (sessionID, disposed) => refreshNow(sessionID, disposed),
	})

	createEffect(() => {
		ensureStoreSynced(props.session)
	})

	const usage = () => readSessionUsage(props.session)
	const compaction = () => readCompaction(props.session)
	const allowance = () => {
		ensureStoreSynced(props.session)
		return readAllowance(props.session)
	}
	const estimate = () => rows()[0]
	const fmt = formatTokens

	const formatReset = (ts: number) => {
		if (!ts) return ''
		try {
			return new Date(ts).toLocaleString()
		} catch {
			return ''
		}
	}

	const openUsageUrl = async (url: string) => {
		const target = String(url || '').trim()
		if (!target) return
		try {
			const anyCtx = ctx as any
			if (typeof anyCtx?.system?.openExternal === 'function') {
				await anyCtx.system.openExternal(target)
				return
			}
			if (typeof anyCtx?.desktop?.openExternal === 'function') {
				await anyCtx.desktop.openExternal(target)
			}
		} catch {
			/* ignore */
		}
	}

	const header = () => {
		const u = usage()
		if (u) {
			return {
				modelID: u.modelID || estimate()?.modelID || 'unknown model',
				agent: u.agent || estimate()?.agent || 'agent',
				source: u.source,
				used: u.tokens,
				usable: u.usable,
				reserve: u.reserve,
				pct: u.share,
				cost: u.cost,
				risk: u.risk,
			}
		}
		const row = estimate()
		if (!row) return null
		const used = row.ctx || 0
		const usable = row.usable || 0
		const pct = usable > 0 ? (used / usable) * 100 : null
		const risk = pct == null ? 'unknown' : pct >= 90 ? 'high' : pct >= 70 ? 'medium' : 'low'
		return {
			modelID: row.modelID || 'unknown model',
			agent: row.agent || 'agent',
			source: row.source || 'estimate',
			used,
			usable,
			reserve: row.reserve || 0,
			pct,
			cost: 0,
			risk,
		}
	}

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
			<div
				style={{
					display: 'flex',
					'justify-content': 'space-between',
					'align-items': 'center',
					gap: '8px',
					'flex-wrap': 'wrap',
				}}
			>
				<div style={{ 'font-size': '11px', opacity: 0.6 }}>
					{usage()
						? 'Live usage from session store'
						: lastOk()
							? `Estimate updated ${new Date(lastOk()).toLocaleTimeString()}${failures() > 0 ? ' · retrying with backoff' : ''}`
							: loaded()
								? 'No successful estimate yet'
								: 'Loading…'}
				</div>
				<button
					type="button"
					class="oh-my-gui-btn"
					disabled={refreshing()}
					onClick={() => void refreshNow(props.session.id, () => false)}
					style={{ 'font-size': '11px', padding: '2px 8px' }}
				>
					{refreshing() ? 'Refreshing…' : 'Refresh estimate'}
				</button>
			</div>

			<Show when={header()}>
				{(h) => {
					const used = () => h().used
					const total = () => h().usable
					const hasTotal = () => total() > 0
					const pct = () => h().pct
					const width = () => {
						const p = pct()
						return p === null ? 0 : Math.min(100, Math.max(0, p))
					}
					const tone = () => pctTone(pct())
					const pctLabel = () => {
						const p = pct()
						return p === null ? 'n/a' : `${p.toFixed(0)}%`
					}
					return (
						<div style={CARD}>
							<div
								style={{
									display: 'flex',
									'justify-content': 'space-between',
									'align-items': 'center',
									gap: '8px',
								}}
							>
								<div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
									<span style={{ 'font-weight': '600', 'font-size': '12px' }}>{h().modelID}</span>
									<span style={{ 'font-size': '11px', opacity: 0.55 }}>
										{h().agent} · {h().source}
										{h().cost > 0 ? ` · ${formatCost(h().cost)}` : ''}
									</span>
								</div>
								<div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
									<span style={{ 'font-size': '14px', 'font-weight': '700', color: tone() }}>
										{pctLabel()}
									</span>
									<span style={{ 'font-size': '11px', opacity: 0.55 }}>used</span>
								</div>
							</div>
							<div style={{ ...TRACK, height: '8px' }}>
								<div
									style={{
										width: `${width()}%`,
										height: '100%',
										'background-color': tone(),
										transition: 'width 0.3s ease',
									}}
								/>
							</div>
							<div
								style={{
									display: 'flex',
									'justify-content': 'space-between',
									'font-size': '11px',
									opacity: 0.7,
								}}
							>
								<span>
									{fmt(used())}
									{hasTotal() ? ` / ${fmt(total())}` : ' tokens · limit unknown'}
								</span>
								<span>
									{hasTotal() ? `reserve ${fmt(h().reserve || 0)}` : ''}
									{h().risk !== 'unknown' ? ` · ${h().risk}` : ''}
								</span>
							</div>
							<Show when={compaction()}>
								{(c) => {
									const tone =
										c().status === 'running'
											? tok.warning
											: c().status === 'failed'
												? tok.error
												: tok.success
									return (
										<div
											role="status"
											aria-live="polite"
											style={{
												'margin-top': '4px',
												'padding-top': '6px',
												'border-top': `1px solid ${tok.border}`,
												display: 'flex',
												'flex-direction': 'column',
												gap: '2px',
												'font-size': '11px',
											}}
										>
											<span style={{ 'font-weight': '600', color: tone }}>
												{c().status === 'running'
													? `Compacting (${c().reason})`
													: c().status === 'failed'
														? `Compaction failed (${c().reason})`
														: `Compaction ${c().status} (${c().reason})`}
											</span>
											<Show when={c().status === 'running'}>
												<span style={{ opacity: 0.75 }}>Background summary is being written…</span>
											</Show>
											<Show when={c().status !== 'running' && (c().cost || c().tokens)}>
												<span style={{ opacity: 0.75 }}>
													{c().cost != null ? formatCost(c().cost!) : ''}
													{c().tokens != null
														? `${c().cost != null ? ' · ' : ''}${fmt(c().tokens!)} tokens`
														: ''}
												</span>
											</Show>
											<Show when={c().error}>
												<span style={{ color: tok.error }}>{c().error}</span>
											</Show>
										</div>
									)
								}}
							</Show>
						</div>
					)
				}}
			</Show>

			<Show when={allowance()}>
				{(a) => (
					<div style={CARD}>
						<div
							style={{
								display: 'flex',
								'justify-content': 'space-between',
								'align-items': 'center',
								gap: '8px',
							}}
						>
							<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
								{ctx.t('context.allowance')}
								{a().workspaceName ? ` · ${a().workspaceName}` : ''}
							</span>
							<Show when={a().usageURL}>
								<button
									type="button"
									class="oh-my-gui-btn"
									style={{ 'font-size': '11px', padding: '1px 6px' }}
									onClick={() => void openUsageUrl(a().usageURL)}
								>
									{ctx.t('context.allowance.open')}
								</button>
							</Show>
						</div>
						<For each={a().meters}>
							{(m) => (
								<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
									<div
										style={{
											display: 'flex',
											'justify-content': 'space-between',
											'font-size': '11px',
										}}
									>
										<span>
											{m.label}
											{m.limited ? ` · ${ctx.t('context.allowance.limited')}` : ''}
										</span>
										<span style={{ color: m.limited ? tok.error : pctTone(m.percent) }}>
											{m.percent.toFixed(0)}%
										</span>
									</div>
									<div style={{ ...TRACK, height: '4px' }}>
										<div
											style={{
												width: `${Math.min(100, Math.max(0, m.percent))}%`,
												height: '100%',
												'background-color': m.limited ? tok.error : pctTone(m.percent),
											}}
										/>
									</div>
									<Show when={m.resetsAt}>
										<span style={{ 'font-size': '10px', opacity: 0.6 }}>
											{ctx.t('context.allowance.resets', {
												when: formatReset(m.resetsAt),
											})}
										</span>
									</Show>
								</div>
							)}
						</For>
						<For each={a().budgets}>
							{(b) => {
								const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : null
								return (
									<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
										<div
											style={{
												display: 'flex',
												'justify-content': 'space-between',
												'font-size': '11px',
											}}
										>
											<span>
												{ctx.t('context.allowance.budget', {
													spent: formatCost(b.spent),
													limit: formatCost(b.limit),
												})}
												{b.shared ? ' · shared' : ''}
											</span>
											<span style={{ color: pctTone(pct) }}>
												{pct == null ? '—' : `${pct.toFixed(0)}%`}
											</span>
										</div>
										<div style={{ ...TRACK, height: '4px' }}>
											<div
												style={{
													width: `${pct == null ? 0 : Math.min(100, Math.max(0, pct))}%`,
													height: '100%',
													'background-color': pctTone(pct),
												}}
											/>
										</div>
										<Show when={b.resetsAt}>
											<span style={{ 'font-size': '10px', opacity: 0.6 }}>
												{ctx.t('context.allowance.resets', {
													when: formatReset(b.resetsAt),
												})}
											</span>
										</Show>
									</div>
								)
							}}
						</For>
					</div>
				)}
			</Show>

			<Show
				when={loaded()}
				fallback={
					<Show when={!usage()}>
						<div role="status" aria-live="polite" style={{ opacity: 0.7, 'font-size': '12px' }}>
							Loading estimate...
						</div>
					</Show>
				}
			>
				<Show when={error()}>
					<div role="alert" style={{ 'font-size': '12px', color: tok.error }}>
						Estimate unavailable: {error()}
						{failures() > 1 ? ` (attempt ${failures()})` : ''} · retrying
					</div>
				</Show>
				<Show when={estimate()}>
					{(row) => {
						const used = () => row().ctx || 0
						return (
							<>
								<div style={CARD}>
									<div
										style={{
											display: 'flex',
											'justify-content': 'space-between',
											'align-items': 'center',
										}}
									>
										<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
											Breakdown (estimate)
										</span>
										<span style={{ 'font-size': '11px', opacity: 0.55 }}>{fmt(used())} total</span>
									</div>
									<div style={{ ...TRACK, display: 'flex', height: '6px' }}>
										<For each={SERIES}>
											{(cat) => {
												const val = row()[cat[0]] || 0
												const share = used() > 0 ? Math.max(0, (val / used()) * 100) : 0
												if (share <= 0) return null
												return (
													<div
														style={{
															width: `${share}%`,
															height: '100%',
															'background-color': cat[2],
															opacity: 0.85,
														}}
													/>
												)
											}}
										</For>
									</div>
									<For each={SERIES}>
										{(cat) => {
											const val = row()[cat[0]] || 0
											const share = used() > 0 ? Math.max(0, (val / used()) * 100) : 0
											const dim = val === 0
											return (
												<div
													style={{
														display: 'flex',
														'align-items': 'center',
														gap: '8px',
														opacity: dim ? 0.4 : 1,
													}}
												>
													<span style={{ width: '84px', 'font-size': '11px' }}>{cat[1]}</span>
													<div style={{ ...TRACK, 'flex-grow': 1, height: '4px' }}>
														<div
															style={{
																width: `${share}%`,
																height: '100%',
																'background-color': cat[2],
															}}
														/>
													</div>
													<span
														style={{
															width: '48px',
															'text-align': 'right',
															'font-size': '11px',
														}}
													>
														{fmt(val)}
													</span>
												</div>
											)
										}}
									</For>
								</div>

								<Show when={usage()}>
									{(u) => (
										<div style={CARD}>
											<div
												style={{
													display: 'flex',
													'justify-content': 'space-between',
													'align-items': 'center',
												}}
											>
												<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
													Provider tokens
												</span>
												<span style={{ 'font-size': '11px', opacity: 0.55 }}>
													{formatCost(u().cost)}
												</span>
											</div>
											<div
												style={{
													display: 'grid',
													'grid-template-columns': '1fr 1fr',
													gap: '4px 10px',
													'font-size': '11px',
												}}
											>
												<div>
													<span style={{ opacity: 0.65 }}>Input:</span> {fmt(u().input)}
												</div>
												<div>
													<span style={{ opacity: 0.65 }}>Output:</span> {fmt(u().output)}
												</div>
												<div>
													<span style={{ opacity: 0.65 }}>Reasoning:</span> {fmt(u().reasoning)}
												</div>
												<div>
													<span style={{ opacity: 0.65 }}>Cache read:</span> {fmt(u().cacheRead)}
												</div>
												<div>
													<span style={{ opacity: 0.65 }}>Cache write:</span> {fmt(u().cacheWrite)}
												</div>
											</div>
										</div>
									)}
								</Show>

								<Show
									when={(() => {
										const c = compaction()
										return c && c.status !== 'running' ? c : undefined
									})()}
								>
									{(c) => (
										<div style={CARD}>
											<div
												style={{
													display: 'flex',
													'justify-content': 'space-between',
													'align-items': 'center',
												}}
											>
												<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
													Last compaction
												</span>
												<span style={{ 'font-size': '11px', opacity: 0.55 }}>
													{c().reason}
													{c().cost != null ? ` · ${formatCost(c().cost!)}` : ''}
												</span>
											</div>
											<div
												style={{
													display: 'grid',
													'grid-template-columns': '1fr 1fr',
													gap: '4px 10px',
													'font-size': '11px',
												}}
											>
												<div>
													<span style={{ opacity: 0.65 }}>Status:</span> {c().status}
												</div>
												<div>
													<span style={{ opacity: 0.65 }}>Tokens:</span>{' '}
													{c().tokens != null ? fmt(c().tokens!) : '—'}
												</div>
												<Show when={c().input != null}>
													<div>
														<span style={{ opacity: 0.65 }}>Input:</span> {fmt(c().input!)}
													</div>
												</Show>
												<Show when={c().output != null}>
													<div>
														<span style={{ opacity: 0.65 }}>Output:</span> {fmt(c().output!)}
													</div>
												</Show>
											</div>
										</div>
									)}
								</Show>

								<Show when={health()}>
									{(h) => {
										const risk = String(h().compactionRisk || header()?.risk || 'unknown')
										const tone =
											risk === 'high'
												? tok.error
												: risk === 'medium'
													? tok.warning
													: risk === 'low'
														? tok.success
														: tok.muted
										const hasTotal = (header()?.usable || 0) > 0
										const guidance =
											risk === 'high'
												? 'Compaction risk is high. Consider compacting or starting a fresh session, and trim large tool outputs where possible.'
												: risk === 'medium'
													? 'Compaction risk is rising. Keep prompts focused and avoid unnecessary large tool results.'
													: !hasTotal && (h().totalTokens || 0) > 0
														? 'Model context limit is unknown; usage is estimated. Watch for compaction or model errors.'
														: ''
										return (
											<>
												<Show when={guidance}>
													<div
														role="status"
														aria-live="polite"
														style={{
															...CARD,
															'border-color': tone,
															'background-color': tok.surface,
															'font-size': '11px',
															'line-height': '1.35',
														}}
													>
														<span style={{ 'font-weight': '600', color: tone }}>Guidance</span>
														<span style={{ opacity: 0.85 }}>{guidance}</span>
													</div>
												</Show>
												<div style={CARD}>
													<div
														style={{
															display: 'flex',
															'justify-content': 'space-between',
															'align-items': 'center',
														}}
													>
														<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
															Session health
														</span>
														<span
															style={{ 'font-size': '11px', color: tone, 'font-weight': '600' }}
														>
															compaction: {risk}
														</span>
													</div>
													<div
														style={{
															display: 'grid',
															'grid-template-columns': '1fr 1fr',
															gap: '4px 10px',
															'font-size': '11px',
														}}
													>
														<div>
															<span style={{ opacity: 0.65 }}>Hooks:</span>{' '}
															{fmt(h().hookCount || 0)}
															{h().hookErrors ? (
																<span style={{ color: tok.error }}> · {h().hookErrors} err</span>
															) : null}
														</div>
														<div>
															<span style={{ opacity: 0.65 }}>Tool calls:</span>{' '}
															{fmt(h().toolCalls || 0)}
														</div>
														<div>
															<span style={{ opacity: 0.65 }}>Prompt est.:</span>{' '}
															{fmt(h().promptTokensEst || 0)}
														</div>
														<div>
															<span style={{ opacity: 0.65 }}>Output est.:</span>{' '}
															{fmt(h().outputTokensEst || 0)}
														</div>
														<div style={{ 'grid-column': '1 / -1', opacity: 0.65 }}>
															Last hook:{' '}
															{h().lastHookAt ? new Date(h().lastHookAt).toLocaleTimeString() : '—'}
														</div>
													</div>
												</div>
											</>
										)
									}}
								</Show>

								<div style={{ 'font-size': '10px', opacity: 0.45 }}>
									{usage() ? 'usage + ' : ''}
									estimate · updated {new Date(row().updatedAt).toLocaleTimeString()}
								</div>
							</>
						)
					}}
				</Show>
			</Show>
		</div>
	)
}
