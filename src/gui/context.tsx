/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { createSessionPoll } from './poll'

/** key on the row, label, accent color */
const SERIES = [
	['system', 'System', '#60a5fa'],
	['toolSchemas', 'Tool schemas', '#a78bfa'],
	['user', 'User', '#34d399'],
	['assistant', 'Assistant', '#22d3ee'],
	['reasoning', 'Reasoning', '#f472b6'],
	['toolArgs', 'Tool args', '#fbbf24'],
	['toolOut', 'Tool output', '#fb923c'],
	['other', 'Other', '#94a3b8'],
] as const

const CARD = {
	display: 'flex',
	'flex-direction': 'column',
	gap: '8px',
	padding: '10px',
	'border-radius': '8px',
	border: '1px solid rgba(255,255,255,0.08)',
	'background-color': 'rgba(255,255,255,0.02)',
} as const

const TRACK = {
	width: '100%',
	'border-radius': '999px',
	'background-color': 'rgba(255,255,255,0.07)',
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
			const result = (await withTimeout(
				ctx.client.rpc(DashboardRpc).context({ sessionID }),
				8000,
			)) as { rows?: unknown }
			if (disposed()) return 'skipped'
			setRows(Array.isArray(result.rows) ? result.rows : [])
			// Health is optional and was doubling RPC load during thrash.
			const h = (await ctx.client
				.rpc(DashboardRpc)
				.health({ sessionID })
				.catch(() => null)) as { data?: unknown } | null
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
			// Always clear the lock — if we skip this when disposed, the next
			// effect mount sees refreshing=true and every poll returns 'skipped'.
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

	const root = () => rows()[0]
	const fmt = (n: number) =>
		n >= 1_000_000
			? `${(n / 1_000_000).toFixed(2)}M`
			: n >= 1000
				? `${(n / 1000).toFixed(1)}k`
				: String(Math.round(n))

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
					{lastOk()
						? `Updated ${new Date(lastOk()).toLocaleTimeString()}${failures() > 0 ? ' · retrying with backoff' : ''}`
						: loaded()
							? 'No successful update yet'
							: 'Loading…'}
				</div>
				<button
					type="button"
					class="oh-my-gui-btn"
					disabled={refreshing()}
					onClick={() => void refreshNow(props.session.id, () => false)}
					style={{ 'font-size': '11px', padding: '2px 8px' }}
				>
					{refreshing() ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>
			<Show
				when={loaded()}
				fallback={
					<div role="status" aria-live="polite" style={{ opacity: 0.7, 'font-size': '12px' }}>
						Loading context...
					</div>
				}
			>
				<Show when={error()}>
					<div role="alert" style={{ 'font-size': '12px', color: '#f87171' }}>
						Server unavailable: {error()}
						{failures() > 1 ? ` (attempt ${failures()})` : ''} · retrying
					</div>
				</Show>
				<Show
					when={root()}
					fallback={
						<Show when={!error()}>
							<div style={{ opacity: 0.7, 'font-size': '12px' }}>No measurement yet.</div>
						</Show>
					}
				>
					{(row) => {
						const used = row().ctx || 0
						const total = row().usable || 0
						const hasTotal = total > 0
						const pct = hasTotal ? (used / total) * 100 : null
						const width = pct === null ? 0 : Math.min(100, Math.max(0, pct))
						const tone =
							pct === null ? '#64748b' : pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#22c55e'
						const pctLabel = pct === null ? 'n/a' : `${pct.toFixed(0)}%`
						return (
							<>
								{/* --- usage card --- */}
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
											<span style={{ 'font-weight': '600', 'font-size': '12px' }}>
												{row().modelID || 'unknown model'}
											</span>
											<span style={{ 'font-size': '11px', opacity: 0.55 }}>
												{row().agent || 'agent'} · {row().source}
											</span>
										</div>
										<div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
											<span
												style={{
													'font-size': '14px',
													'font-weight': '700',
													color: tone,
												}}
											>
												{pctLabel}
											</span>
											<span style={{ 'font-size': '11px', opacity: 0.55 }}>used</span>
										</div>
									</div>
									<div style={{ ...TRACK, height: '8px' }}>
										<div
											style={{
												width: `${width}%`,
												height: '100%',
												'background-color': tone,
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
											{fmt(used)}
											{hasTotal ? ` / ${fmt(total)}` : ' tokens · limit unknown'}
										</span>
										<span>{hasTotal ? `reserve ${fmt(row().reserve || 0)}` : ''}</span>
									</div>
								</div>

								{/* --- breakdown card --- */}
								<div style={CARD}>
									<div
										style={{
											display: 'flex',
											'justify-content': 'space-between',
											'align-items': 'center',
										}}
									>
										<span style={{ 'font-size': '12px', 'font-weight': '500' }}>Breakdown</span>
										<span style={{ 'font-size': '11px', opacity: 0.55 }}>{fmt(used)} total</span>
									</div>
									{/* composition bar */}
									<div style={{ ...TRACK, display: 'flex', height: '6px' }}>
										<For each={SERIES}>
											{(cat) => {
												const val = row()[cat[0]] || 0
												const share = used > 0 ? Math.max(0, (val / used) * 100) : 0
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
											const share = used > 0 ? Math.max(0, (val / used) * 100) : 0
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

								<Show when={health()}>
									{(h) => {
										const risk = String(h().compactionRisk || 'unknown')
										const riskTone =
											risk === 'high'
												? '#f87171'
												: risk === 'medium'
													? '#fbbf24'
													: risk === 'low'
														? '#22c55e'
														: '#94a3b8'
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
															'border-color':
																risk === 'high'
																	? 'rgba(248,113,113,0.35)'
																	: risk === 'medium'
																		? 'rgba(251,191,36,0.3)'
																		: 'rgba(148,163,184,0.2)',
															'background-color':
																risk === 'high'
																	? 'rgba(248,113,113,0.06)'
																	: risk === 'medium'
																		? 'rgba(251,191,36,0.05)'
																		: 'rgba(255,255,255,0.02)',
															'font-size': '11px',
															'line-height': '1.35',
														}}
													>
														<span style={{ 'font-weight': '600', color: riskTone }}>Guidance</span>
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
															style={{ 'font-size': '11px', color: riskTone, 'font-weight': '600' }}
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
																<span style={{ color: '#f87171' }}> · {h().hookErrors} err</span>
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
															{' · '}estimates only (no cost data)
														</div>
													</div>
												</div>
											</>
										)
									}}
								</Show>

								<div style={{ 'font-size': '10px', opacity: 0.45 }}>
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
