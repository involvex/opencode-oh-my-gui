import { For, Show, createEffect, createSignal } from 'solid-js'
import type { MountedSession } from '@opencode/plugin/gui'
import { ensureStoreSynced, readAgents } from './session-store'
import { tok } from './tokens'

export function AgentsView(props: { session: MountedSession }) {
	const [notice, setNotice] = createSignal('')

	createEffect(() => {
		ensureStoreSynced(props.session)
	})

	const list = () => {
		ensureStoreSynced(props.session)
		return readAgents(props.session)
	}

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

	const refresh = () => {
		const data = props.session.server?.data
		const location = props.session.location
		if (data && location) void data.location.agent.sync(location).catch(() => {})
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
				<div style={{ 'font-size': '11px', opacity: 0.6 }}>Live from session store</div>
				<button
					type="button"
					class="oh-my-gui-btn"
					onClick={refresh}
					style={{ 'font-size': '11px', padding: '2px 8px' }}
				>
					Refresh
				</button>
			</div>
			<Show when={notice()}>
				<div role="status" aria-live="polite" style={{ 'font-size': '11px', opacity: 0.7 }}>
					{notice()}
				</div>
			</Show>
			<Show
				when={list() !== undefined}
				fallback={
					<div role="status" aria-live="polite">
						Loading agents...
					</div>
				}
			>
				<For each={list() ?? []}>
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
									border: a.active ? `1px solid ${tok.success}` : `1px solid ${tok.border}`,
									'background-color': tok.surface,
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
													'background-color': tok.surfaceRaised,
													color: tok.success,
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
									<b>Permissions:</b>{' '}
									{tools.length > 0
										? `${tools.length} — ${tools.slice(0, 8).join(', ')}${tools.length > 8 ? '…' : ''}`
										: '—'}
								</div>
							</div>
						)
					}}
				</For>
				<Show when={(list() ?? []).length === 0}>
					<div style={{ opacity: 0.7 }}>No agents reported.</div>
				</Show>
			</Show>
		</div>
	)
}
