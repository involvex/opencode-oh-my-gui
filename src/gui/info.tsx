/* eslint-disable @typescript-eslint/no-explicit-any */
import { Show, createSignal } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { createSessionPoll } from './poll'
import { tok } from './tokens'

export function InfoView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [data, setData] = createSignal<any>(null)
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
				ctx.client.rpc(DashboardRpc).overview({ sessionID }),
				8000,
			)) as any
			if (disposed()) return 'skipped'
			setData(result?.data ?? null)
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
			setData(null)
			setError('')
			setFailures(0)
			setLastOk('')
		},
		intervalMs: () => Number((ctx.stores.prefs.value as any).pollMs) || 5000,
		tick: (sessionID, disposed) => refreshNow(sessionID, disposed),
	})

	const copyDiagnostics = async () => {
		try {
			const client = ctx.client.rpc(DashboardRpc)
			const [ov, ctxRes, hk] = await Promise.all([
				client.overview({ sessionID: props.session.id }).catch(() => null),
				client.context({ sessionID: props.session.id }).catch(() => null),
				client.hooks({ sessionID: props.session.id, limit: 50 }).catch(() => null),
			])
			const bundle = {
				generatedAt: new Date().toISOString(),
				sessionID: props.session.id,
				overview: (ov as any)?.data ?? d() ?? null,
				context: (ctxRes as any)?.rows ?? [],
				hooks: (hk as any)?.entries ?? [],
			}
			const text = JSON.stringify(bundle, null, 2)
			if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
			else console.log(text)
			setNotice('Diagnostics copied (sanitized)')
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1800)
	}

	const d = () => data()

	const copyValue = async (value: string, label: string) => {
		const text = String(value || '').trim()
		if (!text || text === '—') return
		try {
			if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
			else console.log(text)
			setNotice(`Copied ${label}`)
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1500)
	}

	const openPathOrCopy = async (dir: string) => {
		const target = String(dir || '').trim()
		if (!target) return
		try {
			const anyCtx = ctx as any
			if (typeof anyCtx?.system?.openPath === 'function') {
				await anyCtx.system.openPath(target)
				setNotice('Opened path')
				setTimeout(() => setNotice(''), 1500)
				return
			}
			if (typeof anyCtx?.desktop?.openPath === 'function') {
				await anyCtx.desktop.openPath(target)
				setNotice('Opened path')
				setTimeout(() => setNotice(''), 1500)
				return
			}
			if (typeof anyCtx?.system?.openExternal === 'function') {
				await anyCtx.system.openExternal(target)
				setNotice('Opened path')
				setTimeout(() => setNotice(''), 1500)
				return
			}
		} catch {
			/* fall through to clipboard */
		}
		await copyValue(target, 'path')
	}

	const Row = (p: {
		label: string
		value: string
		copyLabel?: string
		actions?: { label: string; title?: string; run: () => void | Promise<void> }[]
	}) => (
		<div
			style={{
				display: 'flex',
				'align-items': 'flex-start',
				gap: '8px',
				'flex-wrap': 'wrap',
			}}
		>
			<div style={{ 'min-width': 0, 'flex-grow': '1', 'word-break': 'break-word' }}>
				<b>{p.label}:</b> {p.value || '—'}
			</div>
			<div style={{ display: 'flex', gap: '4px', 'flex-shrink': '0' }}>
				<Show when={p.copyLabel && p.value && p.value !== '—'}>
					<button
						type="button"
						class="oh-my-gui-btn"
						style={{ 'font-size': '11px', padding: '1px 6px' }}
						onClick={() => void copyValue(p.value, p.copyLabel!)}
						title={`Copy ${p.copyLabel}`}
					>
						Copy
					</button>
				</Show>
				{(p.actions ?? []).map((a) => (
					<button
						type="button"
						class="oh-my-gui-btn"
						style={{ 'font-size': '11px', padding: '1px 6px' }}
						onClick={() => void a.run()}
						title={a.title}
					>
						{a.label}
					</button>
				))}
			</div>
		</div>
	)

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'font-size': '12px' }}>
			<div
				style={{
					display: 'flex',
					gap: '8px',
					'align-items': 'center',
					'flex-wrap': 'wrap',
					'justify-content': 'space-between',
				}}
			>
				<div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
					<button type="button" class="oh-my-gui-btn" onClick={() => void copyDiagnostics()}>
						Copy diagnostics
					</button>
					<button
						type="button"
						class="oh-my-gui-btn"
						disabled={refreshing()}
						onClick={() => void refreshNow(props.session.id, () => false)}
					>
						{refreshing() ? 'Refreshing…' : 'Refresh'}
					</button>
					<Show when={notice()}>
						<span role="status" aria-live="polite" style={{ 'font-size': '11px', opacity: 0.7 }}>
							{notice()}
						</span>
					</Show>
				</div>
				<div style={{ 'font-size': '11px', opacity: 0.55 }}>
					{lastOk()
						? `Updated ${new Date(lastOk()).toLocaleTimeString()}${failures() > 0 ? ' · backoff' : ''}`
						: ''}
				</div>
			</div>
			<Show
				when={loaded()}
				fallback={
					<div role="status" aria-live="polite">
						Loading info...
					</div>
				}
			>
				<Show when={error()}>
					<div role="alert" style={{ color: tok.error }}>
						Unavailable: {error()}
						{failures() > 1 ? ` (attempt ${failures()})` : ''} · retrying
					</div>
				</Show>
				<Show when={d()}>
					{(x) => (
						<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
							<Row label="Session" value={x().sessionID} copyLabel="session ID" />
							<Row label="Agent" value={x().agent || '—'} copyLabel="agent" />
							<Row label="Model" value={x().modelID || '—'} copyLabel="model" />
							<Row label="Provider" value={x().providerID || '—'} copyLabel="provider" />
							<Row
								label="Directory"
								value={x().directory || '—'}
								copyLabel="path"
								actions={[
									{
										label: 'Open',
										title: 'Open directory (falls back to copy)',
										run: () => openPathOrCopy(x().directory || ''),
									},
								]}
							/>
							<Row label="Git branch" value={x().gitBranch || '—'} copyLabel="branch" />
							<Row label="MCP" value={(x().mcp || []).join(', ') || '—'} />
							<Row label="Todos" value={String(x().todos ?? '—')} />
							<Row label="Updated" value={x().updatedAt || '—'} />
						</div>
					)}
				</Show>
			</Show>
		</div>
	)
}
