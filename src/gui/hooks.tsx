/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import { DashboardRpc } from '../rpc'

export function HooksView(props: { session: MountedSession }) {
	const ctx = usePlugin()
	const [entries, setEntries] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [filter, setFilter] = createSignal('')

	createEffect(() => {
		const sessionID = props.session.id
		let pending = false
		let disposed = false
		setLoaded(false)
		setEntries([])
		setError('')
		const load = async () => {
			if (disposed || pending) return
			pending = true
			try {
				const result = (await ctx.client.rpc(DashboardRpc).hooks({ sessionID, limit: 80 })) as any
				if (disposed) return
				setEntries(Array.isArray(result?.entries) ? result.entries : [])
				setError('')
			} catch (err) {
				if (disposed) return
				setError(err instanceof Error ? err.message : String(err))
			} finally {
				pending = false
				if (!disposed) setLoaded(true)
			}
		}
		void load()
		const timer = setInterval(() => void load(), 1500)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
	})

	const filtered = () => {
		const f = filter().toLowerCase()
		if (!f) return entries()
		return entries().filter(
			(e) => String(e.type).toLowerCase().includes(f) || String(e.tool).toLowerCase().includes(f),
		)
	}

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
			<input
				placeholder="filter"
				value={filter()}
				onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
			/>
			<Show when={loaded()} fallback={<div>Loading hooks...</div>}>
				<Show when={error()}>
					<div>Unavailable: {error()}</div>
				</Show>
				<div style={{ 'max-height': '320px', overflow: 'auto', 'font-size': '11px' }}>
					<For each={filtered()}>
						{(e) => (
							<div
								style={{ padding: '2px 0', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}
							>
								<span style={{ opacity: 0.6 }}>{e.ts?.slice(11, 19)} </span>
								<span style={{ 'font-weight': '600' }}>{e.type}</span>
								{e.tool ? <span> · {e.tool}</span> : null}
								{e.status ? <span> [{e.status}]</span> : null}
							</div>
						)}
					</For>
				</div>
			</Show>
		</div>
	)
}
