/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'

export function AgentsView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [agents, setAgents] = createSignal<any[]>([])
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [notice, setNotice] = createSignal('')

	createEffect(() => {
		const sessionID = props.session.id
		const ms = Math.max(500, Number((ctx.stores.prefs.value as any).pollMs) || 3000)
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
		const timer = setInterval(() => void load(), ms)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
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
			<Show when={notice()}>
				<div style={{ 'font-size': '11px', opacity: 0.7 }}>{notice()}</div>
			</Show>
			<Show when={loaded()} fallback={<div>Loading agents...</div>}>
				<Show when={error()}>
					<div style={{ color: '#f87171' }}>Unavailable: {error()}</div>
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
