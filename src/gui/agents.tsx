/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import { DashboardRpc } from '../rpc'

export function AgentsView(props: { session: MountedSession }) {
	const ctx = usePlugin()
	const [agents, setAgents] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)

	createEffect(() => {
		const sessionID = props.session.id
		let pending = false
		let disposed = false
		setLoaded(false)
		setAgents([])
		setError('')
		const load = async () => {
			if (disposed || pending) return
			pending = true
			try {
				const result = (await ctx.client.rpc(DashboardRpc).agents({ sessionID })) as any
				if (disposed) return
				setAgents(Array.isArray(result?.agents) ? result.agents : [])
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
		const timer = setInterval(() => void load(), 3000)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
	})

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
			<Show when={loaded()} fallback={<div>Loading agents...</div>}>
				<Show when={error()}>
					<div>Unavailable: {error()}</div>
				</Show>
				<For each={agents()}>
					{(a) => (
						<div
							style={{
								display: 'flex',
								'justify-content': 'space-between',
								padding: '4px 0',
								'border-bottom': '1px solid rgba(255,255,255,0.08)',
							}}
						>
							<span>
								{a.name}
								{a.active ? ' (active)' : ''}
							</span>
							<span style={{ opacity: 0.7 }}>{a.modelID}</span>
						</div>
					)}
				</For>
			</Show>
		</div>
	)
}
