/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Command,
	ComposerPill,
	MenuItem,
	Panel,
	SettingsPage,
	usePlugin,
	type PanelTab,
	type MountedSession,
	type Command as CommandType,
	type MenuItem as MenuItemType,
} from '@opencode/plugin/gui'
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import type { Plugin } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { ContextView } from './context'
import { AgentsView } from './agents'
import { HooksView } from './hooks'
import { InfoView } from './info'
import { sendCommit, useCommitChanges } from './commit'

const PANEL_ID = 'main'
const ICON = 'window-analytics'
const TITLE = 'Oh My GUI'

const TAB: PanelTab = { id: PANEL_ID, title: TITLE, closable: 'compact', fallback: true }
type DashTab = 'context' | 'agents' | 'hooks' | 'info'
const [requestedTab, setRequestedTab] = createSignal<DashTab | null>(null)

const FOCUS_STYLE_ID = 'oh-my-gui-focus-style'
function ensureFocusStyles() {
	if (typeof document === 'undefined' || document.getElementById(FOCUS_STYLE_ID)) return
	const style = document.createElement('style')
	style.id = FOCUS_STYLE_ID
	style.textContent = `
		.oh-my-gui-tab:focus-visible,
		.oh-my-gui-btn:focus-visible,
		[data-oh-my-gui] button:focus-visible,
		[data-oh-my-gui] input:focus-visible {
			outline: 2px solid rgba(100, 149, 237, 0.85);
			outline-offset: 2px;
		}
	`
	document.head.appendChild(style)
}

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
	ensureFocusStyles()
	const key = `${ctx.id}:${PANEL_ID}`

	const open = (session?: MountedSession, tab?: DashTab) => {
		const ref = session ?? ctx.sessions.current()
		if (!ref) return
		if (tab) setRequestedTab(tab)
		ctx.layout.open(key, ref, { tab: 'select' })
	}
	const toggle = (session?: MountedSession) => {
		const ref = session ?? ctx.sessions.current()
		if (!ref) return
		ctx.layout.toggle(key, ref)
	}

	ctx.add(Panel, {
		id: PANEL_ID,
		region: 'side',
		wide: true,
		list: (input) => (input.open.includes(PANEL_ID) ? [TAB] : []),
		render: (props) => <PanelShell session={props.session} />,
		mobile: { title: TITLE, order: 1, kind: 'tab', icon: ICON },
	})

	ctx.add(MenuItem, (): MenuItemType => ({
		menu: 'session.panel' as const,
		id: PANEL_ID,
		title: TITLE,
		icon: ICON,
		description: 'Agents, context, hooks & info',
		opened: !!ctx.sessions.current() && ctx.layout.state(key, ctx.sessions.current()!) !== 'closed',
		run: () => open(),
	}))

	ctx.add(Command, (): CommandType => ({
		id: 'toggle',
		title: ctx.t('command.toggle'),
		description: 'Toggle the Oh My GUI side panel',
		keywords: 'oh my gui panel agents context hooks info dashboard',
		section: 'terminal' as const,
		bind: 'ctrl+`',
		slash: { name: ctx.t('command.toggle.slash') },
		enabled: !!ctx.sessions.current(),
		run: () => toggle(),
	}))

	const tabCommands: Array<{ id: DashTab; title: string; keywords: string }> = [
		{ id: 'context', title: 'Open Oh My GUI: Context', keywords: 'tokens usage health breakdown' },
		{ id: 'agents', title: 'Open Oh My GUI: Agents', keywords: 'agents models tools' },
		{ id: 'hooks', title: 'Open Oh My GUI: Hooks', keywords: 'hooks events tools log errors' },
		{ id: 'info', title: 'Open Oh My GUI: Info', keywords: 'session info git mcp todos' },
	]
	for (const cmd of tabCommands) {
		ctx.add(Command, (): CommandType => ({
			id: `open.${cmd.id}`,
			title: cmd.title,
			description: 'Open the Oh My GUI panel and focus this tab',
			keywords: `oh my gui dashboard ${cmd.keywords}`,
			section: 'terminal' as const,
			enabled: !!ctx.sessions.current(),
			run: () => open(undefined, cmd.id),
		}))
	}

	ctx.add(Command, (): CommandType => ({
		id: 'copy-diagnostics',
		title: 'Copy Oh My GUI diagnostics bundle',
		description: 'Copy sanitized overview, context, and recent hooks for bug reports',
		keywords: 'oh my gui diagnostics report export logs copy',
		section: 'terminal' as const,
		enabled: !!ctx.sessions.current(),
		run: async () => {
			const session = ctx.sessions.current()
			if (!session) return
			try {
				const client = ctx.client.rpc(DashboardRpc)
				const [ov, ctxRes, hk] = await Promise.all([
					client.overview({ sessionID: session.id }).catch(() => null),
					client.context({ sessionID: session.id }).catch(() => null),
					client.hooks({ sessionID: session.id, limit: 50 }).catch(() => null),
				])
				const bundle = {
					generatedAt: new Date().toISOString(),
					sessionID: session.id,
					overview: (ov as any)?.data ?? null,
					context: (ctxRes as any)?.rows ?? [],
					hooks: (hk as any)?.entries ?? [],
				}
				const text = JSON.stringify(bundle, null, 2)
				if (navigator?.clipboard?.writeText) {
					await navigator.clipboard.writeText(text)
					try {
						ctx.toast.show({ title: 'Diagnostics copied (sanitized)', variant: 'success' } as any)
					} catch {
						/* ignore */
					}
				} else {
					console.log(text)
					try {
						ctx.toast.show({ title: 'Diagnostics logged to console', variant: 'info' } as any)
					} catch {
						/* ignore */
					}
				}
			} catch {
				try {
					ctx.toast.show({ title: 'Failed to copy diagnostics', variant: 'error' } as any)
				} catch {
					/* ignore */
				}
			}
		},
	}))

	// composer pill
	const [pill, setPill] = createSignal<
		{ sessionID: string; label: string; tone?: 'warning' | 'danger' } | undefined
	>(undefined)
	const refreshPill = async () => {
		const session = ctx.sessions.current()
		if (!session) {
			setPill(undefined)
			return
		}
		try {
			const result = (await ctx.client.rpc(DashboardRpc).context({ sessionID: session.id })) as any
			const row = result?.rows?.[0]
			if (!row) {
				setPill(undefined)
				return
			}
			if (row.usable && row.usable > 0) {
				const share = (row.ctx / row.usable) * 100
				setPill({
					sessionID: session.id,
					label: `${share.toFixed(0)}% ctx`,
					tone: share >= 90 ? 'danger' : share >= 70 ? 'warning' : undefined,
				})
				return
			}
			if (row.ctx && row.ctx > 0) {
				setPill({
					sessionID: session.id,
					label: `${row.ctx >= 1000 ? (row.ctx / 1000).toFixed(1) + 'k' : row.ctx} ctx`,
					tone: undefined,
				})
				return
			}
			setPill(undefined)
		} catch {
			setPill(undefined)
		}
	}
	createEffect(() => {
		const ms = Math.max(500, Number((ctx.stores.prefs.value as any).pollMs) || 1500)
		void refreshPill()
		const timer = setInterval(() => void refreshPill(), ms)
		onCleanup(() => clearInterval(timer))
	})

	ctx.add(ComposerPill, () => ({
		id: 'context',
		show: ({ session }) => {
			const current = pill()
			if (!current || current.sessionID !== session.id) return undefined
			return {
				label: current.label,
				icon: ICON,
				tone: current.tone,
				title: 'Context window usage',
				run: () => open(session as any),
			}
		},
	}))

	const commitState = useCommitChanges(ctx)
	const [busy, setBusy] = createSignal<string | undefined>()

	const runCommit = async (session: MountedSession) => {
		const key = session.key
		if (busy() === key) return
		setBusy(key)
		try {
			await sendCommit(session)
		} catch {
			try {
				ctx.toast.show({ title: ctx.t('toast.commit.failed'), variant: 'error' } as any)
			} catch {
				/* ignore */
			}
		} finally {
			if (busy() === key) setBusy(undefined)
		}
	}

	ctx.add(ComposerPill, () => ({
		id: 'commit',
		order: 1,
		show: ({ session }) => {
			const prefs = ctx.stores.prefs.value as any
			if (prefs.showCommit === false) return undefined
			const { count } = commitState(session)
			const pending = busy() === session.key
			if (count === 0 && !pending) return undefined
			return {
				label: pending ? ctx.t('pill.commit.busy') : `${ctx.t('pill.commit')} ${count}`,
				icon: 'check',
				tone: pending ? 'warning' : undefined,
				title: ctx.t('pill.commit.title'),
				run: () => void runCommit(session as MountedSession),
			}
		},
	}))

	// settings page
	ctx.add(SettingsPage, {
		id: 'oh-my-gui',
		icon: ICON,
		get title() {
			return ctx.t('settings.title')
		},
		get entries() {
			return [
				{ id: 'context', title: 'Context section', keywords: 'context tokens' },
				{ id: 'agents', title: 'Agents section', keywords: 'agents' },
				{ id: 'hooks', title: 'Hooks section', keywords: 'hooks events' },
				{ id: 'info', title: 'Info section', keywords: 'info session' },
			]
		},
		render: (input) => <SettingsView target={input.target} />,
	})
}

function PanelShell(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [tab, setTab] = createSignal<DashTab>('context')
	const prefs = () => ctx.stores.prefs.value as any

	const visible = (id: DashTab) => {
		const p = prefs()
		if (id === 'context') return p.showContext !== false
		if (id === 'agents') return p.showAgents !== false
		if (id === 'hooks') return p.showHooks !== false
		return p.showInfo !== false
	}

	createEffect(() => {
		const req = requestedTab()
		if (!req) return
		if (visible(req)) setTab(req)
		setRequestedTab(null)
	})

	createEffect(() => {
		if (!visible(tab())) {
			const first = (['context', 'agents', 'hooks', 'info'] as DashTab[]).find(visible)
			if (first) setTab(first)
		}
	})

	const tabIds = () => (['context', 'agents', 'hooks', 'info'] as DashTab[]).filter(visible)
	const onTabKeyDown = (e: KeyboardEvent) => {
		const ids = tabIds()
		if (ids.length === 0) return
		const current = ids.indexOf(tab())
		const move = (next: number) => {
			const id = ids[(next + ids.length) % ids.length]
			if (!id) return
			setTab(id)
			queueMicrotask(() => {
				const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
					`[role="tab"][aria-controls="oh-my-gui-panel-${id}"]`,
				)
				el?.focus()
			})
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault()
			move((current < 0 ? 0 : current) + 1)
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault()
			move((current < 0 ? 0 : current) - 1)
		} else if (e.key === 'Home') {
			e.preventDefault()
			move(0)
		} else if (e.key === 'End') {
			e.preventDefault()
			move(ids.length - 1)
		}
	}

	const TabButton = (p: { id: DashTab; label: string }) => (
		<button
			type="button"
			role="tab"
			class="oh-my-gui-tab"
			tabIndex={tab() === p.id ? 0 : -1}
			aria-selected={tab() === p.id}
			aria-controls={`oh-my-gui-panel-${p.id}`}
			onClick={() => setTab(p.id)}
			style={{
				padding: '4px 8px',
				'border-radius': '6px',
				border: tab() === p.id ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
				'background-color': tab() === p.id ? 'rgba(255,255,255,0.06)' : 'transparent',
				cursor: 'pointer',
			}}
		>
			{p.label}
		</button>
	)

	return (
		<div
			data-oh-my-gui="panel"
			style={{
				display: 'flex',
				'flex-direction': 'column',
				gap: '8px',
				padding: '10px',
				'font-size': '12px',
			}}
		>
			<div
				role="tablist"
				aria-label="Oh My GUI sections"
				onKeyDown={onTabKeyDown}
				style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}
			>
				<Show when={visible('context')}>
					<TabButton id="context" label={ctx.t('tab.context')} />
				</Show>
				<Show when={visible('agents')}>
					<TabButton id="agents" label={ctx.t('tab.agents')} />
				</Show>
				<Show when={visible('hooks')}>
					<TabButton id="hooks" label={ctx.t('tab.hooks')} />
				</Show>
				<Show when={visible('info')}>
					<TabButton id="info" label={ctx.t('tab.info')} />
				</Show>
			</div>
			<div>
				<Show when={tab() === 'context' && visible('context')}>
					<div id="oh-my-gui-panel-context" role="tabpanel">
						<ContextView session={props.session} />
					</div>
				</Show>
				<Show when={tab() === 'agents' && visible('agents')}>
					<div id="oh-my-gui-panel-agents" role="tabpanel">
						<AgentsView session={props.session} />
					</div>
				</Show>
				<Show when={tab() === 'hooks' && visible('hooks')}>
					<div id="oh-my-gui-panel-hooks" role="tabpanel">
						<HooksView session={props.session} />
					</div>
				</Show>
				<Show when={tab() === 'info' && visible('info')}>
					<div id="oh-my-gui-panel-info" role="tabpanel">
						<InfoView session={props.session} />
					</div>
				</Show>
			</div>
		</div>
	)
}

function SettingsView(props: { target?: string }) {
	const ctx = usePlugin<typeof definition>()
	const p = ctx.stores.prefs as any
	const [configNotice, setConfigNotice] = createSignal('')

	const isTarget = (id: string) =>
		props.target === id ||
		(props.target === 'pill' && id === 'pill') ||
		(props.target === 'hooks' && id === 'hooks')

	const cardStyle = (id: string) => ({
		display: 'flex',
		'flex-direction': 'column' as const,
		gap: '12px',
		padding: '16px',
		'border-radius': '8px',
		border:
			isTarget(id) && props.target
				? '1px solid rgba(100, 149, 237, 0.45)'
				: '1px solid var(--border, rgba(255,255,255,0.1))',
		'background-color':
			isTarget(id) && props.target
				? 'rgba(100, 149, 237, 0.08)'
				: 'var(--surface, rgba(255,255,255,0.02))',
	})

	const setPref = (patch: Record<string, unknown>) => p.set({ ...p.value, ...patch })

	const applyServerMaxHooks = async (value: number) => {
		const maxHooks = Math.max(20, Math.min(2000, Math.floor(value) || 200))
		setPref({ maxHooks })
		try {
			await ctx.client.rpc(DashboardRpc).config({ maxHooks })
			setConfigNotice(`Server hook retention: ${maxHooks}`)
		} catch (err) {
			setConfigNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setConfigNotice(''), 2000)
	}

	return (
		<div
			style={{
				display: 'flex',
				'flex-direction': 'column',
				gap: '16px',
				padding: '20px',
				'max-width': '520px',
			}}
		>
			<div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
				<h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': '600' }}>
					{ctx.t('settings.title')}
				</h2>
				<p style={{ margin: 0, 'font-size': '12px', opacity: 0.7 }}>
					Configure dashboard visibility, refresh cadence, and retention.
				</p>
			</div>

			<Show when={configNotice()}>
				<div style={{ 'font-size': '12px', opacity: 0.75 }}>{configNotice()}</div>
			</Show>

			<div style={cardStyle('context')}>
				<div style={{ 'font-size': '13px', 'font-weight': '500' }}>Context & refresh</div>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showContext !== false}
						onChange={(e) => setPref({ showContext: (e.target as HTMLInputElement).checked })}
					/>
					<span style={{ 'font-size': '13px' }}>Show Context tab</span>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
					<span style={{ 'font-size': '13px', 'min-width': '150px' }}>Poll interval (ms)</span>
					<input
						type="number"
						min="500"
						max="30000"
						step="250"
						value={Number(p.value.pollMs) || 1500}
						onInput={(e) =>
							setPref({
								pollMs: Math.max(
									500,
									Math.min(30000, Number((e.target as HTMLInputElement).value) || 1500),
								),
							})
						}
						style={{ width: '120px' }}
					/>
				</label>
				<div style={{ 'font-size': '11px', opacity: 0.6 }}>
					Applies to context/agents/hooks/info polling and the context pill.
				</div>
			</div>

			<div style={cardStyle('agents')}>
				<div style={{ 'font-size': '13px', 'font-weight': '500' }}>Panel tabs</div>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showAgents !== false}
						onChange={(e) => setPref({ showAgents: (e.target as HTMLInputElement).checked })}
					/>
					<span style={{ 'font-size': '13px' }}>Show Agents tab</span>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showHooks !== false}
						onChange={(e) => setPref({ showHooks: (e.target as HTMLInputElement).checked })}
					/>
					<span style={{ 'font-size': '13px' }}>Show Hooks tab</span>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showInfo !== false}
						onChange={(e) => setPref({ showInfo: (e.target as HTMLInputElement).checked })}
					/>
					<span style={{ 'font-size': '13px' }}>Show Info tab</span>
				</label>
			</div>

			<div style={cardStyle('hooks')}>
				<div style={{ 'font-size': '13px', 'font-weight': '500' }}>Hook retention & history</div>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
					<span style={{ 'font-size': '13px', 'min-width': '150px' }}>Server max hooks</span>
					<input
						type="number"
						min="20"
						max="2000"
						step="20"
						value={Number(p.value.maxHooks) || 200}
						onChange={(e) => void applyServerMaxHooks(Number((e.target as HTMLInputElement).value))}
						style={{ width: '120px' }}
					/>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
					<span style={{ 'font-size': '13px', 'min-width': '150px' }}>Hooks fetch limit</span>
					<input
						type="number"
						min="10"
						max="500"
						step="10"
						value={Number(p.value.hooksFetchLimit) || 80}
						onInput={(e) =>
							setPref({
								hooksFetchLimit: Math.max(
									10,
									Math.min(500, Number((e.target as HTMLInputElement).value) || 80),
								),
							})
						}
						style={{ width: '120px' }}
					/>
				</label>
				<div style={{ 'font-size': '11px', opacity: 0.6 }}>
					Server max hooks controls in-memory retention (best-effort). Fetch limit controls how many
					entries the Hooks view requests.
				</div>
			</div>

			<div style={cardStyle('pill')}>
				<div style={{ 'font-size': '13px', 'font-weight': '500' }}>{ctx.t('settings.pill')}</div>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showCommit !== false}
						onChange={(e) => setPref({ showCommit: (e.target as HTMLInputElement).checked })}
					/>
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
						<span style={{ 'font-size': '13px' }}>{ctx.t('settings.showCommit')}</span>
						<span style={{ 'font-size': '11px', opacity: 0.6 }}>
							Show Commit pill when there are uncommitted changes
						</span>
					</div>
				</label>
			</div>

			<Show when={props.target}>
				<div style={{ 'font-size': '11px', opacity: 0.55 }}>
					Settings target: <code>{props.target}</code>
				</div>
			</Show>
		</div>
	)
}
