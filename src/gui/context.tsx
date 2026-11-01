/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import { DashboardRpc } from '../rpc'

const CATEGORIES = [
	['system', 'System'],
	['toolSchemas', 'Tool schemas'],
	['user', 'User'],
	['assistant', 'Assistant'],
	['reasoning', 'Reasoning'],
	['toolArgs', 'Tool args'],
	['toolOut', 'Tool output'],
	['other', 'Other'],
] as const

export function ContextView(props: { session: MountedSession }) {
	const ctx = usePlugin()
	const [rows, setRows] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)

	createEffect(() => {
		const sessionID = props.session.id
		let pending = false
		let disposed = false
		setLoaded(false)
		setRows([])
		setError('')

		const load = async () => {
			if (disposed || pending) return
			pending = true
			try {
				const result = (await ctx.client.rpc(DashboardRpc).context({ sessionID })) as any
				if (disposed) return
				setRows(Array.isArray(result?.rows) ? result.rows : [])
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

	const root = () => rows()[0]
	const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
			<Show when={loaded()} fallback={<div>Loading context...</div>}>
				<Show when={error()}>
					<div>Server unavailable: {error()} (retrying)</div>
				</Show>
				<Show
					when={root()}
					fallback={
						<Show when={!error()}>
							<div>No measurement yet.</div>
						</Show>
					}
				>
					{(row) => (
						<>
							<div style={{ display: 'flex', 'justify-content': 'space-between' }}>
								<span style={{ 'font-weight': '600' }}>{row().modelID || 'unknown model'}</span>
								<span>
									{fmt(row().ctx)} / {fmt(row().usable)}
								</span>
							</div>
							<For each={CATEGORIES}>
								{(cat) => (
									<div style={{ display: 'grid', 'grid-template-columns': '1fr auto', gap: '6px' }}>
										<span>{cat[1]}</span>
										<span>{fmt(row()[cat[0]])}</span>
									</div>
								)}
							</For>
						</>
					)}
				</Show>
			</Show>
		</div>
	)
}
