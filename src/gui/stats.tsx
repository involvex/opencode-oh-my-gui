/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { formatCost, formatTokens } from './usage'
import { tok } from './tokens'
import {
	fetchSessionStats,
	rangeBounds,
	tokenTotal,
	type StatsRangeId,
	type StatsSnapshot,
} from './stats-model'

const CARD = {
	display: 'flex',
	'flex-direction': 'column',
	gap: '8px',
	padding: '10px',
	'border-radius': '8px',
	border: `1px solid ${tok.border}`,
	'background-color': tok.surface,
} as const

const RANGES: { id: StatsRangeId; labelKey: string }[] = [
	{ id: 'today', labelKey: 'stats.range.today' },
	{ id: '7d', labelKey: 'stats.range.7d' },
	{ id: '30d', labelKey: 'stats.range.30d' },
]

export function StatsView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const prefs = () => ctx.stores.prefs.value as any
	const [range, setRange] = createSignal<StatsRangeId>((prefs().statsRange as StatsRangeId) || '7d')
	const [data, setData] = createSignal<StatsSnapshot | null>(null)
	const [supported, setSupported] = createSignal(true)
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [refreshing, setRefreshing] = createSignal(false)
	const [lastOk, setLastOk] = createSignal('')

	const projectID = () => {
		try {
			return String((props.session as any).project?.id || '')
		} catch {
			return ''
		}
	}

	const refresh = async () => {
		if (refreshing()) return
		setRefreshing(true)
		try {
			const client = props.session.server?.client
			const bounds = rangeBounds(range())
			const result = await fetchSessionStats(client, {
				...bounds,
				project: projectID() || undefined,
				tools: 'detail',
			})
			setSupported(result.supported)
			setData(result.data)
			setError(result.supported ? '' : ctx.t('stats.unsupported'))
			if (result.supported) setLastOk(new Date().toISOString())
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setRefreshing(false)
			setLoaded(true)
		}
	}

	createEffect(() => {
		// Track session + range so switching tabs/ranges refetches.
		const key = `${props.session.id}:${range()}:${projectID()}`
		if (!key) return
		void refresh()
	})

	const pickRange = (id: StatsRangeId) => {
		setRange(id)
		ctx.stores.prefs.set({ ...prefs(), statsRange: id } as any)
	}

	const Metric = (p: { label: string; value: string }) => (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', 'min-width': '72px' }}>
			<span style={{ 'font-size': '10px', opacity: 0.6 }}>{p.label}</span>
			<span style={{ 'font-weight': '600', 'font-size': '13px' }}>{p.value}</span>
		</div>
	)

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
				<div
					style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}
					role="group"
					aria-label={ctx.t('stats.range')}
				>
					<For each={RANGES}>
						{(r) => (
							<button
								type="button"
								class="oh-my-gui-btn"
								aria-pressed={range() === r.id}
								onClick={() => pickRange(r.id)}
								style={{
									'font-size': '11px',
									padding: '2px 8px',
									'background-color': range() === r.id ? tok.surfaceRaised : 'transparent',
									border: range() === r.id ? `1px solid ${tok.border}` : '1px solid transparent',
								}}
							>
								{ctx.t(r.labelKey)}
							</button>
						)}
					</For>
				</div>
				<div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
					<span style={{ 'font-size': '11px', opacity: 0.55 }}>
						{lastOk() ? `Updated ${new Date(lastOk()).toLocaleTimeString()}` : ''}
					</span>
					<button
						type="button"
						class="oh-my-gui-btn"
						disabled={refreshing()}
						onClick={() => void refresh()}
						style={{ 'font-size': '11px', padding: '2px 8px' }}
					>
						{refreshing() ? ctx.t('stats.refreshing') : ctx.t('stats.refresh')}
					</button>
				</div>
			</div>

			<span style={{ 'font-size': '11px', opacity: 0.6 }}>{ctx.t('stats.scope')}</span>

			<Show when={error()}>
				<div role="alert" style={{ color: tok.error, 'font-size': '12px' }}>
					{error()}
				</div>
			</Show>

			<Show
				when={loaded()}
				fallback={
					<div role="status" aria-live="polite">
						{ctx.t('stats.loading')}
					</div>
				}
			>
				<Show when={supported() && data()}>
					{(s) => (
						<>
							<div style={CARD}>
								<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
									{ctx.t('stats.summary')}
								</span>
								<div style={{ display: 'flex', gap: '12px', 'flex-wrap': 'wrap' }}>
									<Metric label={ctx.t('stats.sessions')} value={String(s().sessions)} />
									<Metric label={ctx.t('stats.subagents')} value={String(s().subagents)} />
									<Metric label={ctx.t('stats.prompts')} value={String(s().prompts)} />
									<Metric label={ctx.t('stats.steps')} value={String(s().steps)} />
									<Metric label={ctx.t('stats.cost')} value={formatCost(s().cost)} />
									<Metric label={ctx.t('stats.activeDays')} value={String(s().activeDays)} />
									<Metric label={ctx.t('stats.streak')} value={String(s().streak)} />
								</div>
							</div>

							<div style={CARD}>
								<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
									{ctx.t('stats.tokens')}
								</span>
								<div
									style={{ display: 'flex', gap: '12px', 'flex-wrap': 'wrap', 'font-size': '11px' }}
								>
									<span>
										{ctx.t('stats.tokens.total')}: {formatTokens(tokenTotal(s().tokens))}
									</span>
									<span>
										in {formatTokens(s().tokens.input)} · out {formatTokens(s().tokens.output)}
									</span>
									<span>
										reason {formatTokens(s().tokens.reasoning)} · cache{' '}
										{formatTokens(s().tokens.cacheRead)}/{formatTokens(s().tokens.cacheWrite)}
									</span>
								</div>
							</div>

							<Show when={s().models.length > 0}>
								<div style={CARD}>
									<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
										{ctx.t('stats.models')}
									</span>
									<For each={s().models}>
										{(m) => (
											<div
												style={{
													display: 'flex',
													'justify-content': 'space-between',
													gap: '8px',
													'font-size': '11px',
													'flex-wrap': 'wrap',
												}}
											>
												<span>{[m.providerID, m.modelID].filter(Boolean).join(' / ') || '—'}</span>
												<span style={{ opacity: 0.75 }}>
													{m.steps} steps · {formatCost(m.cost)} ·{' '}
													{formatTokens(tokenTotal(m.tokens))}
												</span>
											</div>
										)}
									</For>
								</div>
							</Show>

							<Show when={s().toolTotals || s().toolUsage.length > 0}>
								<div style={CARD}>
									<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
										{ctx.t('stats.tools')}
									</span>
									<Show when={s().toolTotals}>
										{(t) => (
											<div style={{ 'font-size': '11px', opacity: 0.8 }}>
												{t().calls} calls · {t().succeeded} ok · {t().failed} failed ·{' '}
												{t().unfinished} unfinished
											</div>
										)}
									</Show>
									<For each={s().toolUsage}>
										{(u) => (
											<div
												style={{
													display: 'flex',
													'justify-content': 'space-between',
													gap: '8px',
													'font-size': '11px',
												}}
											>
												<span>{u.name || '—'}</span>
												<span style={{ opacity: 0.75 }}>
													{u.calls} · {u.succeeded}/{u.failed}
													{u.durationP50 != null ? ` · p50 ${Math.round(u.durationP50)}ms` : ''}
												</span>
											</div>
										)}
									</For>
								</div>
							</Show>

							<Show when={s().activity.length > 0}>
								<div style={CARD}>
									<span style={{ 'font-size': '12px', 'font-weight': '500' }}>
										{ctx.t('stats.activity')}
									</span>
									<div
										style={{
											display: 'flex',
											'align-items': 'flex-end',
											gap: '3px',
											height: '48px',
										}}
									>
										<For each={s().activity.slice(-14)}>
											{(a) => {
												const max = Math.max(1, ...s().activity.map((x) => x.steps))
												const h = Math.max(2, Math.round((a.steps / max) * 48))
												return (
													<div
														title={`${a.date}: ${a.steps}`}
														style={{
															width: '8px',
															height: `${h}px`,
															'background-color': tok.primary,
															opacity: 0.75,
															'border-radius': '2px',
														}}
													/>
												)
											}}
										</For>
									</div>
								</div>
							</Show>
						</>
					)}
				</Show>
				<Show when={supported() && !data() && !error()}>
					<div style={{ opacity: 0.7 }}>{ctx.t('stats.empty')}</div>
				</Show>
			</Show>
		</div>
	)
}
