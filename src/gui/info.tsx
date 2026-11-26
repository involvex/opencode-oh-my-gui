/* eslint-disable @typescript-eslint/no-explicit-any */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { dashboardRpc } from './dashboard-rpc'
import type { GoalState } from './goal-rpc'
import {
	buildStoreDiagnostics,
	ensureStoreSynced,
	readSessionOverview,
	readWaiting,
	subscribeGoal,
	type WaitingItem,
} from './session-store'
import { formatCost } from './usage'
import { tok } from './tokens'

/** Set by the waiting pill; InfoView scrolls the waiting section into view. */
export const [waitingFocusAt, setWaitingFocusAt] = createSignal(0)

export function InfoView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [notice, setNotice] = createSignal('')
	const [goal, setGoal] = createSignal<GoalState | null>(null)
	const [waitingEl, setWaitingEl] = createSignal<HTMLDivElement | null>(null)

	createEffect(() => {
		const session = props.session
		ensureStoreSynced(session)
		const stop = subscribeGoal(ctx.client as any, session.id, (g) => setGoal(g))
		onCleanup(stop)
	})

	createEffect(() => {
		const at = waitingFocusAt()
		if (!at) return
		const el = waitingEl()
		if (el) {
			queueMicrotask(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
		}
	})

	const overview = () => {
		ensureStoreSynced(props.session)
		return readSessionOverview(props.session)
	}
	const waiting = () => {
		ensureStoreSynced(props.session)
		return readWaiting(props.session)
	}

	const copyDiagnostics = async () => {
		try {
			const rpc = dashboardRpc(props.session, ctx.client)
			const [ctxRes, hk] = await Promise.all([
				rpc.context({ sessionID: props.session.id }).catch(() => null),
				rpc.hooks({ sessionID: props.session.id, limit: 50 }).catch(() => null),
			])
			const store = buildStoreDiagnostics(props.session, goal())
			const bundle = {
				generatedAt: new Date().toISOString(),
				sessionID: props.session.id,
				...store,
				context: (ctxRes as any)?.rows ?? [],
				hooks: (hk as any)?.entries ?? [],
			}
			const text = JSON.stringify(bundle, null, 2)
			if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
			else console.log(text)
			setNotice(ctx.t('toast.copied'))
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1800)
	}

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

	const WaitingRow = (p: { item: WaitingItem }) => (
		<div
			style={{
				display: 'flex',
				'flex-direction': 'column',
				gap: '2px',
				padding: '8px',
				'border-radius': '8px',
				border: `1px solid ${tok.border}`,
				'background-color': tok.surface,
			}}
		>
			<div style={{ display: 'flex', 'justify-content': 'space-between', gap: '8px' }}>
				<span style={{ 'font-weight': '600' }}>{p.item.title}</span>
				<span style={{ 'font-size': '10px', opacity: 0.65, 'text-transform': 'uppercase' }}>
					{p.item.kind}
					{p.item.status ? ` · ${p.item.status}` : ''}
				</span>
			</div>
			<Show when={p.item.detail}>
				<div style={{ 'font-size': '11px', opacity: 0.75, 'word-break': 'break-word' }}>
					{p.item.detail}
				</div>
			</Show>
		</div>
	)

	const g = () => goal()
	const d = () => overview()

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
					<span style={{ 'font-size': '11px', opacity: 0.55 }}>Live from session store</span>
					<Show when={notice()}>
						<span role="status" aria-live="polite" style={{ 'font-size': '11px', opacity: 0.7 }}>
							{notice()}
						</span>
					</Show>
				</div>
			</div>

			<Show
				when={d()}
				fallback={
					<div role="status" aria-live="polite">
						Loading info...
					</div>
				}
			>
				{(x) => (
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
						<Show when={x().title}>
							<Row label="Title" value={x().title} copyLabel="title" />
						</Show>
						<Row label="Session" value={x().sessionID} copyLabel="session ID" />
						<Show when={x().parentID}>
							<Row
								label="Parent"
								value={x().parentID}
								copyLabel="parent session ID"
								actions={[
									{
										label: 'Open',
										title: 'Open parent session',
										run: () => {
											const id = String(x().parentID || '')
											if (!id) return
											ctx.tabs.open({ server: props.session.server.id, id }, { focus: true })
										},
									},
								]}
							/>
						</Show>
						<Show when={x().forkFrom && x().forkFrom !== x().parentID}>
							<Row label="Forked from" value={x().forkFrom} copyLabel="fork session ID" />
						</Show>
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
						<Row label="MCP" value={x().mcp.join(', ') || '—'} />
						<Row label="Status" value={x().status || '—'} />
						<Show when={x().outcome}>
							<Row label="Outcome" value={x().outcome} />
						</Show>
						<Show when={x().cost > 0}>
							<Row label="Cost" value={formatCost(x().cost)} />
						</Show>
						<Show when={x().children.length > 0}>
							<div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
								<b>Children</b>
								<For each={x().children}>
									{(id) => (
										<div style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
											<span style={{ 'font-family': 'monospace', 'font-size': '11px' }}>
												{id.slice(0, 12)}…
											</span>
											<button
												type="button"
												class="oh-my-gui-btn"
												style={{ 'font-size': '11px', padding: '1px 6px' }}
												onClick={() =>
													ctx.tabs.open({ server: props.session.server.id, id }, { focus: true })
												}
											>
												Open
											</button>
										</div>
									)}
								</For>
							</div>
						</Show>
						<Row label="Updated" value={x().updatedAt || '—'} />
					</div>
				)}
			</Show>

			<div
				style={{
					'margin-top': '4px',
					padding: '8px',
					'border-radius': '8px',
					border: `1px solid ${tok.border}`,
					'background-color': tok.surface,
					display: 'flex',
					'flex-direction': 'column',
					gap: '4px',
				}}
			>
				<span style={{ 'font-weight': '600' }}>{ctx.t('info.goal')}</span>
				<Show
					when={g()}
					fallback={
						<span style={{ 'font-size': '11px', opacity: 0.65 }}>{ctx.t('info.goal.none')}</span>
					}
				>
					{(goalState) => (
						<>
							<div style={{ 'word-break': 'break-word' }}>{goalState().objective}</div>
							<div style={{ 'font-size': '11px', opacity: 0.75 }}>
								{goalState().status}
								{` · ${goalState().rounds}/${goalState().maxRounds} rounds`}
								{goalState().stalls != null ? ` · ${goalState().stalls} stalls` : ''}
							</div>
							<Show when={goalState().reason}>
								<div style={{ 'font-size': '11px', opacity: 0.7 }}>{goalState().reason}</div>
							</Show>
						</>
					)}
				</Show>
			</div>

			<div
				ref={setWaitingEl}
				style={{
					'margin-top': '4px',
					display: 'flex',
					'flex-direction': 'column',
					gap: '6px',
				}}
			>
				<div
					style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}
				>
					<span style={{ 'font-weight': '600' }}>{ctx.t('info.waiting')}</span>
					<span style={{ 'font-size': '11px', opacity: 0.6 }}>{waiting().length}</span>
				</div>
				<Show
					when={waiting().length > 0}
					fallback={
						<span style={{ 'font-size': '11px', opacity: 0.65 }}>{ctx.t('info.waiting.none')}</span>
					}
				>
					<For each={waiting()}>{(item) => <WaitingRow item={item} />}</For>
				</Show>
				<span style={{ 'font-size': '10px', opacity: 0.55 }}>{ctx.t('info.waiting.hint')}</span>
			</div>
		</div>
	)
}
