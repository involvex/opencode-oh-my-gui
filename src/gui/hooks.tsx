/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'

export function HooksView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [entries, setEntries] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [filter, setFilter] = createSignal('')
	const [paused, setPaused] = createSignal(false)
	const [notice, setNotice] = createSignal('')

	const load = async (sessionID: string, disposed: () => boolean, pending: { v: boolean }) => {
		if (disposed() || pending.v || paused()) return
		pending.v = true
		try {
			const limit = Math.max(
				10,
				Math.min(500, Number((ctx.stores.prefs.value as any).hooksFetchLimit) || 80),
			)
			const result = (await ctx.client.rpc(DashboardRpc).hooks({ sessionID, limit })) as any
			if (disposed()) return
			setEntries(Array.isArray(result?.entries) ? result.entries : [])
			setError('')
		} catch (err) {
			if (disposed()) return
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			pending.v = false
			if (!disposed()) setLoaded(true)
		}
	}

	createEffect(() => {
		const sessionID = props.session.id
		const ms = Math.max(500, Number((ctx.stores.prefs.value as any).pollMs) || 1500)
		let disposed = false
		const pending = { v: false }
		setLoaded(false)
		setEntries([])
		setError('')
		const run = () => void load(sessionID, () => disposed, pending)
		run()
		const timer = setInterval(run, ms)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
	})

	const filtered = () => {
		const f = filter().toLowerCase().trim()
		if (!f) return entries()
		return entries().filter((e) => {
			const hay = `${e.type} ${e.tool} ${e.status} ${e.summary} ${e.detail}`.toLowerCase()
			return hay.includes(f)
		})
	}

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

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
			<div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' }}>
				<input
					placeholder="filter type/tool/status/detail"
					value={filter()}
					onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
					style={{ 'flex-grow': '1', 'min-width': '140px' }}
				/>
				<button onClick={() => setPaused(!paused())}>{paused() ? 'Resume' : 'Pause'}</button>
				<button onClick={() => void clear()}>Clear</button>
				<button onClick={() => void exportJson()}>Export</button>
			</div>
			<Show when={notice()}>
				<div style={{ 'font-size': '11px', opacity: 0.7 }}>{notice()}</div>
			</Show>
			<Show when={loaded()} fallback={<div>Loading hooks...</div>}>
				<Show when={error()}>
					<div style={{ color: '#f87171' }}>Unavailable: {error()}</div>
				</Show>
				<div style={{ 'max-height': '320px', overflow: 'auto', 'font-size': '11px' }}>
					<For each={filtered()}>
						{(e) => (
							<div
								style={{
									padding: '4px 0',
									'border-bottom': '1px solid rgba(255,255,255,0.06)',
									display: 'flex',
									'flex-direction': 'column',
									gap: '1px',
								}}
							>
								<div>
									<span style={{ opacity: 0.6 }}>{String(e.ts ?? '').slice(11, 19)} </span>
									<span style={{ 'font-weight': '600' }}>{e.type}</span>
									{e.tool ? <span> · {e.tool}</span> : null}
									{e.status ? (
										<span style={{ color: e.status === 'error' ? '#f87171' : 'inherit' }}>
											{' '}
											[{e.status}]
										</span>
									) : null}
								</div>
								<Show when={e.detail}>
									<div
										style={{ opacity: 0.65, 'white-space': 'pre-wrap', 'word-break': 'break-word' }}
									>
										{e.detail}
									</div>
								</Show>
							</div>
						)}
					</For>
					<Show when={filtered().length === 0}>
						<div style={{ opacity: 0.6, padding: '6px 0' }}>No matching entries.</div>
					</Show>
				</div>
			</Show>
		</div>
	)
}
