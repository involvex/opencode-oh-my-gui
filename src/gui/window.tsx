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
import { createSignal, onCleanup } from 'solid-js'
import type { Plugin } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { ContextView } from './context'
import { AgentsView } from './agents'
import { HooksView } from './hooks'
import { InfoView } from './info'

const PANEL_ID = 'main'
const ICON = 'window-analytics'
const TITLE = 'Oh My GUI'

const TAB: PanelTab = { id: PANEL_ID, title: TITLE, closable: 'compact', fallback: true }

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
	const key = `${ctx.id}:${PANEL_ID}`

	const open = (session?: MountedSession) => {
		const ref = session ?? ctx.sessions.current()
		if (!ref) return
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
		keywords: 'oh my gui panel agents context hooks',
		section: 'terminal' as const,
		bind: 'ctrl+`',
		slash: { name: ctx.t('command.toggle.slash') },
		enabled: !!ctx.sessions.current(),
		run: () => toggle(),
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
					tone: share >= 85 ? 'danger' : share >= 65 ? 'warning' : undefined,
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
	void refreshPill()
	const timer = setInterval(
		() => void refreshPill(),
		(ctx.stores.prefs.value as any).pollMs ?? 1500,
	)
	onCleanup(() => clearInterval(timer))

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
	const [tab, setTab] = createSignal<'context' | 'agents' | 'hooks' | 'info'>('context')
	const prefs = () => ctx.stores.prefs.value as any
	return (
		<div
			style={{
				display: 'flex',
				'flex-direction': 'column',
				gap: '8px',
				padding: '10px',
				'font-size': '12px',
			}}
		>
			<div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
				{prefs().showContext && (
					<button onClick={() => setTab('context')}>{ctx.t('tab.context')}</button>
				)}
				{prefs().showAgents && (
					<button onClick={() => setTab('agents')}>{ctx.t('tab.agents')}</button>
				)}
				{prefs().showHooks && <button onClick={() => setTab('hooks')}>{ctx.t('tab.hooks')}</button>}
				{prefs().showInfo && <button onClick={() => setTab('info')}>{ctx.t('tab.info')}</button>}
			</div>
			<div>
				{tab() === 'context' && <ContextView session={props.session} />}
				{tab() === 'agents' && <AgentsView session={props.session} />}
				{tab() === 'hooks' && <HooksView session={props.session} />}
				{tab() === 'info' && <InfoView session={props.session} />}
			</div>
		</div>
	)
}

function SettingsView(props: { target?: string }) {
	const ctx = usePlugin<typeof definition>()
	const p = ctx.stores.prefs as any
	return (
		<div
			style={{
				display: 'flex',
				'flex-direction': 'column',
				gap: '16px',
				padding: '20px',
				'max-width': '420px',
			}}
		>
			<div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
				<h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': '600' }}>
					{ctx.t('settings.title')}
				</h2>
				<p style={{ margin: 0, 'font-size': '12px', opacity: 0.7 }}>Configure panel visibility</p>
			</div>
			<div
				style={{
					display: 'flex',
					'flex-direction': 'column',
					gap: '12px',
					padding: '16px',
					'border-radius': '8px',
					border: '1px solid var(--border, rgba(255,255,255,0.1))',
					'background-color': 'var(--surface, rgba(255,255,255,0.02))',
				}}
			>
				<div style={{ 'font-size': '13px', 'font-weight': '500', 'margin-bottom': '4px' }}>
					Panel Tabs
				</div>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showContext}
						onChange={(e) =>
							p.set({ ...p.value, showContext: (e.target as HTMLInputElement).checked })
						}
						style={{ cursor: 'pointer' }}
					/>
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
						<span style={{ 'font-size': '13px' }}>Context</span>
						<span style={{ 'font-size': '11px', opacity: 0.6 }}>
							Show context usage information
						</span>
					</div>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showAgents}
						onChange={(e) =>
							p.set({ ...p.value, showAgents: (e.target as HTMLInputElement).checked })
						}
						style={{ cursor: 'pointer' }}
					/>
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
						<span style={{ 'font-size': '13px' }}>Agents</span>
						<span style={{ 'font-size': '11px', opacity: 0.6 }}>Show available agents</span>
					</div>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showHooks}
						onChange={(e) =>
							p.set({ ...p.value, showHooks: (e.target as HTMLInputElement).checked })
						}
						style={{ cursor: 'pointer' }}
					/>
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
						<span style={{ 'font-size': '13px' }}>Hooks</span>
						<span style={{ 'font-size': '11px', opacity: 0.6 }}>Show hook activity log</span>
					</div>
				</label>
				<label style={{ display: 'flex', 'align-items': 'center', gap: '10px', cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={p.value.showInfo}
						onChange={(e) =>
							p.set({ ...p.value, showInfo: (e.target as HTMLInputElement).checked })
						}
						style={{ cursor: 'pointer' }}
					/>
					<div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
						<span style={{ 'font-size': '13px' }}>Info</span>
						<span style={{ 'font-size': '11px', opacity: 0.6 }}>Show session information</span>
					</div>
				</label>
			</div>
			{props.target && (
				<div
					style={{
						padding: '10px 12px',
						'border-radius': '6px',
						'background-color': 'var(--accent-bg, rgba(100, 149, 237, 0.1))',
						border: '1px solid var(--accent-border, rgba(100, 149, 237, 0.3))',
						'font-size': '12px',
					}}
				>
					Highlighted: {props.target}
				</div>
			)}
		</div>
	)
}
