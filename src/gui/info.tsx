/* eslint-disable @typescript-eslint/no-explicit-any */
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'

export function InfoView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [data, setData] = createSignal<any>(null)
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)

	createEffect(() => {
		const sessionID = props.session.id
		const ms = Math.max(500, Number((ctx.stores.prefs.value as any).pollMs) || 3000)
		let pending = false
		let disposed = false
		setLoaded(false)
		setData(null)
		setError('')
		const load = async () => {
			if (disposed || pending) return
			pending = true
			try {
				const result = (await ctx.client.rpc(DashboardRpc).overview({ sessionID })) as any
				if (disposed) return
				setData(result?.data ?? null)
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
		const timer = setInterval(() => void load(), ms)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
	})

	const d = () => data()
	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'font-size': '12px' }}>
			<Show when={loaded()} fallback={<div>Loading info...</div>}>
				<Show when={error()}>
					<div>Unavailable: {error()}</div>
				</Show>
				<Show when={d()}>
					{(x) => (
						<>
							<div>
								<b>Session:</b> {x().sessionID}
							</div>
							<div>
								<b>Agent:</b> {x().agent || '—'}
							</div>
							<div>
								<b>Model:</b> {x().modelID || '—'}
							</div>
							<div>
								<b>Provider:</b> {x().providerID || '—'}
							</div>
							<div>
								<b>Directory:</b> {x().directory || '—'}
							</div>
							<div>
								<b>Git branch:</b> {x().gitBranch || '—'}
							</div>
							<div>
								<b>MCP:</b> {(x().mcp || []).join(', ') || '—'}
							</div>
							<div>
								<b>Todos:</b> {x().todos}
							</div>
							<div>
								<b>Updated:</b> {x().updatedAt}
							</div>
						</>
					)}
				</Show>
			</Show>
		</div>
	)
}
