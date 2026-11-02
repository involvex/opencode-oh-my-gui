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
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
			<Show
				when={loaded()}
				fallback={<div style={{ opacity: 0.7, 'font-size': '12px' }}>Loading context...</div>}
			>
				<Show when={error()}>
					<div style={{ 'font-size': '12px', color: '#f87171' }}>
						Server unavailable: {error()} (retrying)
					</div>
				</Show>
				<Show
					when={root()}
					fallback={
						<Show when={!error()}>
							<div style={{ opacity: 0.7, 'font-size': '12px' }}>No measurement yet.</div>
						</Show>
					}
				>
					{(row) => {
						const used = row().ctx || 0
						const total = row().usable || 1
						const pct = Math.min(100, Math.max(0, (used / total) * 100))
						const tone = pct >= 85 ? '#f87171' : pct >= 65 ? '#fbbf24' : '#22c55e'
						return (
							<>
								<div
									style={{
										display: 'flex',
										'flex-direction': 'column',
										gap: '6px',
										padding: '10px',
										'border-radius': '8px',
										border: '1px solid var(--border, rgba(255,255,255,0.1))',
										'background-color': 'var(--surface, rgba(255,255,255,0.02))',
									}}
								>
									<div
										style={{
											display: 'flex',
											'justify-content': 'space-between',
											'align-items': 'center',
										}}
									>
										<span style={{ 'font-weight': '600', 'font-size': '12px' }}>
											{row().modelID || 'unknown model'}
										</span>
										<span style={{ 'font-size': '12px' }}>
											{fmt(used)} / {fmt(total)} ({pct.toFixed(0)}%)
										</span>
									</div>
									<div
										style={{
											width: '100%',
											height: '6px',
											'border-radius': '999px',
											'background-color': 'rgba(255,255,255,0.08)',
											overflow: 'hidden',
										}}
									>
										<div
											style={{
												width: `${pct}%`,
												height: '100%',
												'background-color': tone,
												transition: 'width 0.3s ease',
											}}
										/>
									</div>
								</div>
								<div
									style={{
										display: 'flex',
										'flex-direction': 'column',
										gap: '6px',
										padding: '10px',
										'border-radius': '8px',
										border: '1px solid var(--border, rgba(255,255,255,0.1))',
										'background-color': 'var(--surface, rgba(255,255,255,0.02))',
									}}
								>
									<div
										style={{ 'font-size': '12px', 'font-weight': '500', 'margin-bottom': '2px' }}
									>
										Breakdown
									</div>
									<For each={CATEGORIES}>
										{(cat) => {
											const val = row()[cat[0]] || 0
											if (val === 0) return null
											return (
												<div
													style={{
														display: 'grid',
														'grid-template-columns': '1fr auto',
														gap: '8px',
														'font-size': '12px',
													}}
												>
													<span style={{ opacity: 0.8 }}>{cat[1]}</span>
													<span>{fmt(val)}</span>
												</div>
											)
										}}
									</For>
								</div>
							</>
						)
					}}
				</Show>
			</Show>
		</div>
	)
}
