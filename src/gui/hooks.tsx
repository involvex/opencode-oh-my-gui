/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { createSessionPoll } from './poll'
import { tok } from './tokens'

type HookPreset = 'all' | 'errors' | 'tools' | 'events' | 'prompt'

export function HooksView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [entries, setEntries] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [filter, setFilter] = createSignal('')
	const [preset, setPreset] = createSignal<HookPreset>('all')
	const [paused, setPaused] = createSignal(false)
	const [notice, setNotice] = createSignal('')
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

	const fetchHooks = async (
		sessionID: string,
		disposed: () => boolean,
		opts?: { force?: boolean },
	): Promise<'ok' | 'error' | 'skipped'> => {
		if (disposed() || refreshing()) return 'skipped'
		if (paused() && !opts?.force) return 'skipped'
		setRefreshing(true)
		try {
			const limit = Math.max(
				10,
				Math.min(500, Number((ctx.stores.prefs.value as any).hooksFetchLimit) || 80),
			)
			const result = (await withTimeout(
				ctx.client.rpc(DashboardRpc).hooks({ sessionID, limit }),
				8000,
			)) as any
			if (disposed()) return 'skipped'
			setEntries(Array.isArray(result?.entries) ? result.entries : [])
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
			setEntries([])
			setError('')
			setFailures(0)
			setLastOk('')
		},
		intervalMs: () => Number((ctx.stores.prefs.value as any).pollMs) || 5000,
		tick: (sessionID, disposed) => fetchHooks(sessionID, disposed),
	})

	const matchesPreset = (e: any, p: HookPreset) => {
		if (p === 'all') return true
		const type = String(e?.type ?? '')
		const status = String(e?.status ?? '').toLowerCase()
		if (p === 'errors') return status === 'error' || status === 'failed' || type.includes('error')
		if (p === 'tools') return type.startsWith('tool.')
		if (p === 'events') return type.startsWith('event:')
		if (p === 'prompt') return type === 'prompt'
		return true
	}

	const filtered = () => {
		const f = filter().toLowerCase().trim()
		const p = preset()
		return entries().filter((e) => {
			if (!matchesPreset(e, p)) return false
			if (!f) return true
			const hay = `${e.type} ${e.tool} ${e.status} ${e.summary} ${e.detail}`.toLowerCase()
			return hay.includes(f)
		})
	}

	const errorCount = () => entries().filter((e) => matchesPreset(e, 'errors')).length

	const clear = async () => {
		try {
			await ctx.client.rpc(DashboardRpc).clearHooks({ sessionID: props.session.id })
			setEntries([])
			setNotice('Cleared')
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1500)
	}

	const exportJson = async () => {
		try {
			const text = JSON.stringify(filtered(), null, 2)
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(text)
				setNotice('Copied JSON')
			} else {
				console.log(text)
				setNotice('Logged JSON')
			}
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1500)
	}

	const PresetBtn = (p: { id: HookPreset; label: string; title?: string }) => (
		<button
			type="button"
			class="oh-my-gui-btn"
			aria-pressed={preset() === p.id}
			title={p.title}
			onClick={() => setPreset(p.id)}
			style={{
				'font-size': '11px',
				padding: '2px 8px',
				'border-radius': '999px',
				border: `1px solid ${tok.border}`,
				'background-color': preset() === p.id ? tok.surfaceRaised : 'transparent',
				cursor: 'pointer',
			}}
		>
			{p.label}
		</button>
	)

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
			<div
				role="group"
				aria-label="Hook filters"
				style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' }}
			>
				<PresetBtn id="all" label={`All (${entries().length})`} />
				<PresetBtn
					id="errors"
					label={`Errors${errorCount() ? ` (${errorCount()})` : ''}`}
					title="Show errors and failures"
				/>
				<PresetBtn id="tools" label="Tools" title="Tool before/after hooks" />
				<PresetBtn id="events" label="Events" title="Event stream entries" />
				<PresetBtn id="prompt" label="Prompt" title="Prompt hooks" />
			</div>
			<div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' }}>
				<input
					aria-label="Filter hooks by type, tool, status, or detail"
					placeholder="filter type/tool/status/detail"
					value={filter()}
					onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
					style={{ 'flex-grow': '1', 'min-width': '140px' }}
				/>
				<button
					type="button"
					class="oh-my-gui-btn"
					onClick={() => void fetchHooks(props.session.id, () => false, { force: true })}
					disabled={refreshing()}
					title="Refresh hooks now"
				>
					{refreshing() ? 'Refreshing…' : 'Refresh'}
				</button>
				<button type="button" class="oh-my-gui-btn" onClick={() => setPaused(!paused())}>
					{paused() ? 'Resume' : 'Pause'}
				</button>
				<button type="button" class="oh-my-gui-btn" onClick={() => void clear()}>
					Clear
				</button>
				<button type="button" class="oh-my-gui-btn" onClick={() => void exportJson()}>
					Export
				</button>
			</div>
			<div style={{ 'font-size': '10px', opacity: 0.55 }}>
				Showing {filtered().length} of {entries().length}
				{paused() ? ' · paused' : ''}
				{lastOk() ? ` · updated ${new Date(lastOk()).toLocaleTimeString()}` : ''}
				{failures() > 0 ? ` · retrying with backoff` : ''}
			</div>
			<Show when={notice()}>
				<div role="status" aria-live="polite" style={{ 'font-size': '11px', opacity: 0.7 }}>
					{notice()}
				</div>
			</Show>
			<Show
				when={loaded()}
				fallback={
					<div role="status" aria-live="polite">
						Loading hooks...
					</div>
				}
			>
				<Show when={error()}>
					<div role="alert" style={{ color: tok.error, 'font-size': '11px' }}>
						Unavailable: {error()}
						{failures() > 1 ? ` (attempt ${failures()})` : ''} · retrying
					</div>
				</Show>
				<div style={{ 'max-height': '320px', overflow: 'auto', 'font-size': '11px' }}>
					<For each={filtered()}>
						{(e) => {
							const isErr = matchesPreset(e, 'errors')
							return (
								<div
									style={{
										padding: '4px 0',
										'border-bottom': `1px solid ${tok.border}`,
										display: 'flex',
										'flex-direction': 'column',
										gap: '1px',
										'background-color': isErr ? tok.surface : 'transparent',
									}}
								>
									<div>
										<span style={{ opacity: 0.6 }}>{String(e.ts ?? '').slice(11, 19)} </span>
										<span style={{ 'font-weight': '600' }}>{e.type}</span>
										{e.tool ? <span> · {e.tool}</span> : null}
										{e.status ? (
											<span style={{ color: isErr ? tok.error : 'inherit' }}> [{e.status}]</span>
										) : null}
									</div>
									<Show when={e.detail}>
										<div
											style={{
												opacity: 0.65,
												'white-space': 'pre-wrap',
												'word-break': 'break-word',
											}}
										>
											{e.detail}
										</div>
									</Show>
								</div>
							)
						}}
					</For>
					<Show when={filtered().length === 0}>
						<div style={{ opacity: 0.6, padding: '6px 0' }}>No matching entries.</div>
					</Show>
				</div>
			</Show>
		</div>
	)
}
