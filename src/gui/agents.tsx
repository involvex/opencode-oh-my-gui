/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { createSessionPoll } from './poll'

export function AgentsView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [agents, setAgents] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
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

	const refreshNow = async (
		sessionID: string,
		disposed: () => boolean,
	): Promise<'ok' | 'error' | 'skipped'> => {
		if (disposed() || refreshing()) return 'skipped'
		setRefreshing(true)
		try {
			const result = (await withTimeout(
				ctx.client.rpc(DashboardRpc).agents({ sessionID }),
				8000,
			)) as any
			if (disposed()) return 'skipped'
			setAgents(Array.isArray(result?.agents) ? result.agents : [])
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
			setAgents([])
			setError('')
			setFailures(0)
			setLastOk('')
		},
		intervalMs: () => Number((ctx.stores.prefs.value as any).pollMs) || 5000,
		tick: (sessionID, disposed) => refreshNow(sessionID, disposed),
	})

	const copy = async (text: string, label: string) => {
		if (!text) return
		try {
			if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
			else console.log(text)
			setNotice(`Copied ${label}`)
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1500)
	}

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
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
						? `Updated ${new Date(lastOk()).toLocaleTimeString()}${failures() > 0 ? ' · backoff' : ''}`
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
			<Show when={notice()}>
				<div role="status" aria-live="polite" style={{ 'font-size': '11px', opacity: 0.7 }}>
					{notice()}
				</div>
			</Show>
			<Show
				when={loaded()}
				fallback={
					<div role="status" aria-live="polite">
						Loading agents...
					</div>
				}
			>
				<Show when={error()}>
					<div role="alert" style={{ color: '#f87171', 'font-size': '12px' }}>
						Unavailable: {error()}
						{failures() > 1 ? ` (attempt ${failures()})` : ''} · retrying
					</div>
				</Show>
				<For each={agents()}>
					{(a) => {
						const model = [a.providerID, a.modelID].filter(Boolean).join(' / ') || '—'
						const tools = Array.isArray(a.tools) ? a.tools : []
						return (
							<div
								style={{
									display: 'flex',
									'flex-direction': 'column',
									gap: '4px',
									padding: '8px',
									'border-radius': '8px',
									border: a.active
										? '1px solid rgba(34,197,94,0.35)'
										: '1px solid rgba(255,255,255,0.08)',
									'background-color': a.active ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
								}}
							>
								<div
									style={{
										display: 'flex',
										'justify-content': 'space-between',
										'align-items': 'center',
										gap: '8px',
									}}
								>
									<div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
										<span style={{ 'font-weight': '600' }}>{a.name || a.id || 'agent'}</span>
										<Show when={a.active}>
											<span
												style={{
													'font-size': '10px',
													padding: '1px 6px',
													'border-radius': '999px',
													'background-color': 'rgba(34,197,94,0.18)',
													color: '#86efac',
												}}
											>
												active
											</span>
										</Show>
										<Show when={a.mode}>
											<span style={{ 'font-size': '10px', opacity: 0.65 }}>{a.mode}</span>
										</Show>
									</div>
									<button
										type="button"
										style={{ 'font-size': '11px' }}
										onClick={() => void copy(String(a.id || a.name || ''), 'agent ID')}
										title="Copy agent ID"
									>
										Copy ID
									</button>
								</div>
								<div style={{ 'font-size': '11px', opacity: 0.75 }}>
									<b>Model:</b> {model}
								</div>
								<Show when={a.description}>
									<div
										style={{
											'font-size': '11px',
											opacity: 0.8,
											'white-space': 'pre-wrap',
											'word-break': 'break-word',
										}}
									>
										{a.description}
									</div>
								</Show>
								<div style={{ 'font-size': '11px', opacity: 0.7 }}>
									<b>Tools:</b>{' '}
									{tools.length > 0
										? `${tools.length} — ${tools.slice(0, 8).join(', ')}${tools.length > 8 ? '…' : ''}`
										: '—'}
								</div>
							</div>
						)
					}}
				</For>
				<Show when={agents().length === 0 && !error()}>
					<div style={{ opacity: 0.7 }}>No agents reported.</div>
				</Show>
			</Show>
		</div>
	)
}
