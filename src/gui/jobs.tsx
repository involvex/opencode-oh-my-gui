/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { createSessionPoll } from './poll'
import { tok } from './tokens'
import { ageLabel, fetchJobList, jobFromLive, statusColor, type JobRow } from './jobs-model'

export function JobsView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [history, setHistory] = createSignal<JobRow[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [lastOk, setLastOk] = createSignal('')
	const [failures, setFailures] = createSignal(0)
	const [refreshing, setRefreshing] = createSignal(false)
	const [listSupported, setListSupported] = createSignal(true)

	const live = (): JobRow[] => {
		const tasks = props.session.background ?? []
		return tasks.map((t) => jobFromLive(t, props.session.id))
	}

	const refreshNow = async (
		sessionID: string,
		disposed: () => boolean,
	): Promise<'ok' | 'error' | 'skipped'> => {
		if (disposed() || refreshing()) return 'skipped'
		setRefreshing(true)
		try {
			const client = (props.session as any).server?.client
			const { supported, rows } = await fetchJobList(client, sessionID, true)
			if (disposed()) return 'skipped'
			setListSupported(supported)
			setHistory(rows)
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
			setHistory([])
			setError('')
			setFailures(0)
			setLastOk('')
		},
		intervalMs: () => Number((ctx.stores.prefs.value as any).pollMs) || 5000,
		tick: (sessionID, disposed) => refreshNow(sessionID, disposed),
	})

	const openSubagent = (row: JobRow) => {
		const id = row.childSessionID || (row.kind === 'subagent' ? row.id : '')
		if (!id) return
		ctx.tabs.open({ server: props.session.server.id, id }, { focus: true })
	}

	const merged = () => {
		const liveIds = new Set(live().map((r) => r.id))
		const hist = history().filter((r) => !liveIds.has(r.id))
		return [...live(), ...hist]
	}

	const runningCount = () =>
		merged().filter((r) => r.displayStatus.toLowerCase() === 'running').length

	const Row = (p: { row: JobRow }) => {
		const canOpen = p.row.kind === 'subagent' && !!(p.row.childSessionID || p.row.id)
		const detail =
			p.row.detail ||
			(p.row.kind === 'shell' && p.row.command
				? p.row.command
				: p.row.kind === 'image'
					? [p.row.model, p.row.path].filter(Boolean).join(' · ')
					: '')
		return (
			<div
				style={{
					padding: '6px 0',
					'border-bottom': `1px solid ${tok.border}`,
					display: 'flex',
					'flex-direction': 'column',
					gap: '2px',
				}}
			>
				<div style={{ display: 'flex', 'justify-content': 'space-between', gap: '8px' }}>
					<span style={{ 'font-weight': '600', 'font-size': '12px' }}>
						{p.row.kind}
						<span style={{ 'font-weight': '400', opacity: 0.7 }}> · {p.row.title}</span>
					</span>
					<span
						style={{
							'font-size': '11px',
							color: statusColor(p.row.displayStatus, tok),
						}}
					>
						{p.row.displayStatus}
						{p.row.status.toLowerCase() === 'timeout' ? ' (timeout)' : ''}
					</span>
				</div>
				<Show when={detail}>
					<div
						style={{
							'font-size': '11px',
							opacity: 0.7,
							'word-break': 'break-word',
						}}
					>
						{detail}
					</div>
				</Show>
				<div
					style={{
						display: 'flex',
						'justify-content': 'space-between',
						'align-items': 'center',
						'font-size': '11px',
						opacity: 0.65,
					}}
				>
					<span>
						{p.row.source === 'live' ? 'live' : 'history'}
						{p.row.started ? ` · ${ageLabel(p.row.started)}` : ''}
					</span>
					<Show when={canOpen}>
						<button
							type="button"
							class="oh-my-gui-btn"
							style={{ 'font-size': '11px', padding: '1px 6px' }}
							onClick={() => openSubagent(p.row)}
						>
							Open
						</button>
					</Show>
				</div>
			</div>
		)
	}

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
			<div
				style={{
					display: 'flex',
					'justify-content': 'space-between',
					'align-items': 'center',
					gap: '8px',
				}}
			>
				<div style={{ 'font-size': '11px', opacity: 0.6 }}>
					{runningCount()} running
					{listSupported() ? ` · ${history().length} listed` : ' · job list unavailable'}
					{lastOk() ? ` · ${new Date(lastOk()).toLocaleTimeString()}` : ''}
					{failures() > 0 ? ' · retrying' : ''}
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

			<Show when={error()}>
				<div role="alert" style={{ 'font-size': '11px', color: tok.error }}>
					{error()}
				</div>
			</Show>

			<Show
				when={loaded() || live().length > 0}
				fallback={
					<div role="status" aria-live="polite" style={{ opacity: 0.7, 'font-size': '12px' }}>
						Loading jobs...
					</div>
				}
			>
				<div style={{ 'max-height': '360px', overflow: 'auto' }}>
					<For each={merged()}>{(row) => <Row row={row} />}</For>
					<Show when={merged().length === 0}>
						<div style={{ opacity: 0.6, padding: '6px 0', 'font-size': '12px' }}>
							No background jobs for this session.
						</div>
					</Show>
				</div>
			</Show>
		</div>
	)
}
