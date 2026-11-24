/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	CodeBlockAction,
	Command,
	ComposerPill,
	MenuItem,
	Panel,
	SettingsPage,
	Slot,
	Theme,
	TitlebarItem,
	usePlugin,
	type PanelTab,
	type MountedSession,
	type Command as CommandType,
	type MenuItem as MenuItemType,
	type TitlebarItem as TitlebarItemType,
} from '@opencode/plugin/gui'
import { Show, createEffect, createSignal } from 'solid-js'
import type { Plugin } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'
import { ContextView } from './context'
import { AgentsView } from './agents'
import { HooksView } from './hooks'
import { InfoView, setWaitingFocusAt } from './info'
import { JobsView } from './jobs'
import { StatsView } from './stats'
import { StatusChip } from './status-chip'
import { sendCommit, useCommitChanges } from './commit'
import { normalizeShellCode, runInTerminal } from './run-shell'
import { formatTokens, readCompaction, readSessionUsage } from './usage'
import {
	fetchJobList,
	isRunningStatus,
	jobFromLive,
	runningJobCount,
	type JobRow,
} from './jobs-model'
import {
	buildStoreDiagnostics,
	ensureStoreSynced,
	forgetStoreSync,
	readWaiting,
	subscribeGoal,
	waitingCount,
} from './session-store'
import ohMyGuiTheme from './themes/oh-my-gui.json'
import ohMyGuiDawnTheme from './themes/oh-my-gui-dawn.json'
import ohMyGuiHackerTheme from './themes/oh-my-gui-hacker.json'
import ohMyGuiHackerAmoledTheme from './themes/oh-my-gui-hacker-amoled.json'
import { MenuBridge } from './contract'
import { tok } from './tokens'

const PANEL_ID = 'main'
const PANEL_WIDTH = 380
const TITLE = 'Oh My GUI'

const TAB: PanelTab = { id: PANEL_ID, title: TITLE, closable: 'compact', fallback: true }
type DashTab = 'context' | 'agents' | 'hooks' | 'info' | 'jobs' | 'stats'
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
			outline: 2px solid var(--primary, rgba(100, 149, 237, 0.85));
			outline-offset: 2px;
		}
	`
	document.head.appendChild(style)
}

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
	ensureFocusStyles()
	const key = `${ctx.id}:${PANEL_ID}`
	const ui = ctx.ui
	const panelIcon = ctx.icons.panel

	if (ctx.app.platform === 'desktop') {
		const menu = ctx.main(MenuBridge)
		void menu.ready({ signal: ctx.signal }).catch(() => {
			/* main not ready yet; event listener still attaches */
		})
		menu.on('action', ({ command }) => {
			void ctx.commands.run(`${ctx.id}:${command}`)
		})
	}

	ctx.add(Theme, ohMyGuiTheme)
	ctx.add(Theme, ohMyGuiDawnTheme)
	ctx.add(Theme, ohMyGuiHackerTheme)
	ctx.add(Theme, ohMyGuiHackerAmoledTheme)

	ctx.add(CodeBlockAction, {
		id: 'run',
		languages: ['sh', 'bash', 'shell', 'zsh', 'powershell', 'ps1', 'pwsh', 'cmd'],
		icon: 'terminal',
		get title() {
			return ctx.t('codeblock.run')
		},
		run: async (input) => {
			const code = normalizeShellCode(input.code)
			if (!code) {
				try {
					ctx.toast.show({ title: ctx.t('toast.shell.empty'), variant: 'warning' } as any)
				} catch {
					/* ignore */
				}
				return
			}
			const session = (input.session as MountedSession | undefined) ?? ctx.sessions.current()
			if (!session) {
				try {
					ctx.toast.show({ title: ctx.t('toast.shell.failed'), variant: 'error' } as any)
				} catch {
					/* ignore */
				}
				return
			}
			try {
				await runInTerminal(code, session)
				try {
					ctx.toast.show({ title: ctx.t('toast.shell.ran'), variant: 'success' } as any)
				} catch {
					/* ignore */
				}
			} catch {
				try {
					ctx.toast.show({ title: ctx.t('toast.shell.failed'), variant: 'error' } as any)
				} catch {
					/* ignore */
				}
			}
		},
	})

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

	// Auto-open on newly added session tabs (seed first tick so restored tabs stay closed).
	const seenSessions = new Set<string>()
	let autoOpenSeeded = false
	createEffect(() => {
		const list = ctx.sessions.list()
		const autoOpen = (ctx.stores.prefs.value as any).autoOpen !== false
		if (!autoOpenSeeded) {
			for (const s of list) seenSessions.add(s.id)
			autoOpenSeeded = true
			return
		}
		const live = new Set(list.map((s) => s.id))
		for (const id of [...seenSessions]) {
			if (!live.has(id)) seenSessions.delete(id)
		}
		for (const s of list) {
			if (seenSessions.has(s.id)) continue
			seenSessions.add(s.id)
			if (!autoOpen) continue
			if (ctx.layout.state(key, s) !== 'closed') continue
			ctx.layout.open(key, s, { tab: 'select', background: true })
		}
	})

	ctx.add(Panel, {
		id: PANEL_ID,
		region: 'side',
		width: PANEL_WIDTH,
		wide: true,
		list: (input) => (input.open.includes(PANEL_ID) ? [TAB] : []),
		render: (props) => <PanelShell session={props.session} />,
		mobile: { title: TITLE, order: 1, kind: 'tab', icon: panelIcon },
	})

	ctx.add(MenuItem, (): MenuItemType => ({
		menu: 'session.panel' as const,
		id: PANEL_ID,
		title: TITLE,
		icon: panelIcon,
		description: 'Agents, context, hooks, jobs, stats & info',
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

	ctx.add(TitlebarItem, (): TitlebarItemType | undefined => {
		const session = ctx.sessions.current()
		if (!session) return undefined
		const opened = ctx.layout.state(key, session) !== 'closed'
		return {
			id: 'toggle',
			label: ctx.t('titlebar.toggle'),
			title: ctx.t('titlebar.toggle.title'),
			icon: panelIcon,
			pressed: opened,
			run: () => toggle(session),
		}
	})

	const tabCommands: Array<{ id: DashTab; title: string; keywords: string }> = [
		{
			id: 'context',
			title: 'Open Oh My GUI: Context',
			keywords: 'tokens usage health breakdown cost',
		},
		{ id: 'agents', title: 'Open Oh My GUI: Agents', keywords: 'agents models tools' },
		{ id: 'hooks', title: 'Open Oh My GUI: Hooks', keywords: 'hooks events tools log errors' },
		{ id: 'jobs', title: 'Open Oh My GUI: Jobs', keywords: 'background jobs shell subagent' },
		{
			id: 'stats',
			title: 'Open Oh My GUI: Stats',
			keywords: 'stats usage cost streak tools models',
		},
		{ id: 'info', title: 'Open Oh My GUI: Info', keywords: 'session info git mcp goal waiting' },
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
		description:
			'Copy sanitized store snapshot, context estimate, and recent hooks for bug reports',
		keywords: 'oh my gui diagnostics report export logs copy',
		section: 'terminal' as const,
		enabled: !!ctx.sessions.current(),
		run: async () => {
			const session = ctx.sessions.current()
			if (!session) return
			try {
				ensureStoreSynced(session)
				const client = ctx.client.rpc(DashboardRpc)
				const [ctxRes, hk, goal] = await Promise.all([
					client.context({ sessionID: session.id }).catch(() => null),
					client.hooks({ sessionID: session.id, limit: 50 }).catch(() => null),
					new Promise<unknown>((resolve) => {
						const stop = subscribeGoal(ctx.client as any, session.id, (g) => {
							stop()
							resolve(g)
						})
						setTimeout(() => {
							stop()
							resolve(null)
						}, 1500)
					}),
				])
				const store = buildStoreDiagnostics(session, (goal as any) ?? null)
				const bundle = {
					generatedAt: new Date().toISOString(),
					sessionID: session.id,
					...store,
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

	const contextWarned = new Set<string>()
	const maybeWarnContext = (sessionID: string, share: number) => {
		const warnAt = Math.max(
			0,
			Math.min(100, Number((ctx.stores.prefs.value as any).contextWarnAt) || 0),
		)
		if (warnAt <= 0) return
		if (share < warnAt) {
			contextWarned.delete(sessionID)
			return
		}
		if (contextWarned.has(sessionID)) return
		contextWarned.add(sessionID)
		try {
			ctx.toast.show({
				title: ctx.t('toast.context.warn', { pct: String(Math.round(share)) }),
				variant: 'warning',
			} as any)
		} catch {
			/* ignore */
		}
	}

	ctx.add(ComposerPill, () => ({
		id: 'context',
		show: ({ session }) => {
			const mounted = session as MountedSession
			const compaction = readCompaction(mounted)
			if (compaction?.status === 'running') {
				const reason = compaction.reason === 'manual' ? 'manual' : 'auto'
				return {
					label: ctx.t('pill.context.compacting'),
					icon: ctx.icons.compacting,
					tone: 'warning' as const,
					title: ctx.t('pill.context.compacting.title', { reason }),
					run: () => open(session as any, 'context'),
				}
			}
			const usage = readSessionUsage(mounted)
			if (!usage) return undefined
			if (usage.share != null) maybeWarnContext(session.id, usage.share)
			if (usage.usable > 0 && usage.share != null) {
				const share = usage.share
				return {
					label: `${share.toFixed(0)}% ctx`,
					icon: panelIcon,
					tone: share >= 90 ? ('danger' as const) : share >= 70 ? ('warning' as const) : undefined,
					title:
						usage.risk === 'high'
							? `Context ${share.toFixed(0)}% used — compaction risk high`
							: usage.risk === 'medium'
								? `Context ${share.toFixed(0)}% used — compaction risk rising`
								: `Context ${share.toFixed(0)}% used${usage.cost > 0 ? ` · $${usage.cost.toFixed(2)}` : ''}`,
					run: () => open(session as any, 'context'),
				}
			}
			if (usage.tokens > 0) {
				return {
					label: `${formatTokens(usage.tokens)} ctx`,
					icon: panelIcon,
					title: `Context: ${usage.tokens.toLocaleString()} tokens (model limit unknown)`,
					run: () => open(session as any, 'context'),
				}
			}
			return undefined
		},
	}))

	const commitState = useCommitChanges(ctx)
	const [busy, setBusy] = createSignal<string | undefined>()

	const runCommit = async (session: MountedSession) => {
		const sessionKey = session.key
		if (busy() === sessionKey) return
		const prefs = ctx.stores.prefs.value as any
		const { count, files } = commitState(session)
		const threshold = Math.max(0, Number(prefs.commitConfirmThreshold) || 0)
		if (threshold > 0 && count >= threshold) {
			const preview = files.slice(0, 8).join('\n')
			const more = files.length > 8 ? `\n… and ${files.length - 8} more` : ''
			const ok = await ctx.dialogs.confirm({
				title: ctx.t('pill.commit.confirm', { count: String(count) }),
				description: `${preview}${more}`,
			})
			if (!ok) return
		}
		setBusy(sessionKey)
		try {
			await sendCommit(session, typeof prefs.commitPrompt === 'string' ? prefs.commitPrompt : '')
		} catch {
			try {
				ctx.toast.show({ title: ctx.t('toast.commit.failed'), variant: 'error' } as any)
			} catch {
				/* ignore */
			}
		} finally {
			if (busy() === sessionKey) setBusy(undefined)
		}
	}

	ctx.add(ComposerPill, () => ({
		id: 'commit',
		order: 1,
		show: ({ session }) => {
			const prefs = ctx.stores.prefs.value as any
			if (prefs.showCommit === false) return undefined
			const { count, files } = commitState(session)
			const pending = busy() === session.key
			if (count === 0 && !pending) return undefined
			const preview = files.slice(0, 5).join(', ')
			const more = files.length > 5 ? `, +${files.length - 5} more` : ''
			return {
				label: pending ? ctx.t('pill.commit.busy') : `${ctx.t('pill.commit')} ${count}`,
				icon: 'check',
				tone: pending ? 'warning' : undefined,
				title: pending
					? ctx.t('pill.commit.title')
					: `${ctx.t('pill.commit.title')}${preview ? `\n${preview}${more}` : ''}`,
				run: () => void runCommit(session as MountedSession),
			}
		},
	}))

	/** Per-session listed jobs (for image/codemode pill counts and cross-session notify). */
	const [listedBySession, setListedBySession] = createSignal<Record<string, JobRow[]>>({})
	const seenJobs = new Map<string, Map<string, { label: string; kind: string }>>()

	const pollListedJobs = async () => {
		const refs = ctx.sessions.list()
		const next: Record<string, JobRow[]> = {}
		for (const ref of refs) {
			try {
				const client = (ref as any).server?.client
				if (!client) continue
				const { supported, rows } = await fetchJobList(client, ref.id, true)
				if (!supported) {
					if (listedBySession()[ref.key]) next[ref.key] = listedBySession()[ref.key]
					continue
				}
				next[ref.key] = rows
			} catch {
				if (listedBySession()[ref.key]) next[ref.key] = listedBySession()[ref.key]
			}
		}
		setListedBySession(next)
	}

	createEffect(() => {
		const pollMs = Math.max(2000, Number((ctx.stores.prefs.value as any).pollMs) || 5000)
		void pollListedJobs()
		const timer = setInterval(() => void pollListedJobs(), pollMs)
		return () => clearInterval(timer)
	})

	createEffect(() => {
		const notify = (ctx.stores.prefs.value as any).notifyJobs !== false
		const refs = ctx.sessions.list()
		const listed = listedBySession()
		const currentMounted = ctx.sessions.current()

		for (const ref of refs) {
			const liveRows =
				currentMounted && currentMounted.key === ref.key
					? (currentMounted.background ?? []).map((t) => jobFromLive(t, ref.id))
					: []
			const hist = listed[ref.key] ?? []
			const liveIds = new Set(liveRows.map((r) => r.id))
			const running = new Map<string, { label: string; kind: string }>()
			for (const row of liveRows) {
				running.set(row.id, { label: row.title, kind: row.kind })
			}
			for (const row of hist) {
				if (liveIds.has(row.id)) continue
				if (!isRunningStatus(row.kind, row.status)) continue
				running.set(row.id, {
					label: row.title || row.kind,
					kind: row.kind,
				})
			}

			const prev = seenJobs.get(ref.key)
			if (!prev) {
				seenJobs.set(ref.key, running)
				continue
			}
			if (notify) {
				for (const [id, meta] of prev) {
					if (running.has(id)) continue
					void ctx.attention.notify({
						title: ctx.t('toast.jobs.done'),
						message: ctx.t('toast.jobs.done.message', {
							label: `${meta.kind}: ${meta.label}`,
						}),
						session: { server: ref.server.id, id: ref.id },
						id: `${ctx.id}:job:${id}`,
					})
				}
			}
			seenJobs.set(ref.key, running)
		}

		const openKeys = new Set(refs.map((r) => r.key))
		for (const key of [...seenJobs.keys()]) {
			if (!openKeys.has(key)) seenJobs.delete(key)
		}
	})

	ctx.add(ComposerPill, () => ({
		id: 'jobs',
		order: 2,
		show: ({ session }) => {
			const prefs = ctx.stores.prefs.value as any
			if (prefs.showJobs === false) return undefined
			const mounted = session as MountedSession
			const listed = listedBySession()[mounted.key] ?? []
			const count = runningJobCount(mounted.background ?? [], listed)
			if (count <= 0) return undefined
			return {
				label: `${count} ${ctx.t('pill.jobs')}`,
				icon: ctx.icons.jobs,
				tone: 'warning' as const,
				title: ctx.t('pill.jobs.title'),
				run: () => open(session as any, 'jobs'),
			}
		},
	}))

	const seenWaiting = new Map<string, Set<string>>()

	createEffect(() => {
		const notify = (ctx.stores.prefs.value as any).notifyWaiting !== false
		const refs = ctx.sessions.list()

		for (const ref of refs) {
			ensureStoreSynced(ref)
			const items = readWaiting(ref)
			const ids = new Set(items.map((i) => i.id))
			const prev = seenWaiting.get(ref.key)
			if (!prev) {
				seenWaiting.set(ref.key, ids)
				continue
			}
			if (notify) {
				for (const item of items) {
					if (prev.has(item.id)) continue
					void ctx.attention.notify({
						title: ctx.t('toast.waiting'),
						message: ctx.t('toast.waiting.message', {
							label: `${item.kind}: ${item.title}`,
						}),
						session: { server: ref.server.id, id: ref.id },
						id: `${ctx.id}:waiting:${item.id}`,
					})
				}
			}
			seenWaiting.set(ref.key, ids)
		}

		const openKeys = new Set(refs.map((r) => r.key))
		for (const key of [...seenWaiting.keys()]) {
			if (!openKeys.has(key)) {
				seenWaiting.delete(key)
				forgetStoreSync(key)
			}
		}
	})

	ctx.add(ComposerPill, () => ({
		id: 'waiting',
		order: 3,
		show: ({ session }) => {
			const prefs = ctx.stores.prefs.value as any
			if (prefs.showWaiting === false) return undefined
			const mounted = session as MountedSession
			ensureStoreSynced(mounted)
			const count = waitingCount(mounted)
			if (count <= 0) return undefined
			return {
				label: `${count} ${ctx.t('pill.waiting')}`,
				icon: ctx.icons.waiting,
				tone: 'warning' as const,
				title: ctx.t('pill.waiting.title'),
				run: () => {
					setWaitingFocusAt(Date.now())
					open(session as any, 'info')
				},
			}
		},
	}))

	ctx.add(Slot, {
		at: 'session.header',
		order: 20,
		render: (input) => (
			<StatusChip
				session={input.session}
				active={input.active}
				listedJobs={() => listedBySession()[input.session.key] ?? []}
				onOpen={(session, tab) => {
					if (tab === 'info') setWaitingFocusAt(Date.now())
					open(session, tab)
				}}
			/>
		),
	})

	ctx.add(Slot, {
		at: 'session.panel.end',
		order: 20,
		render: (input) => (
			<button
				type="button"
				class="oh-my-gui-btn"
				data-oh-my-gui
				title={ctx.t('titlebar.toggle.title')}
				aria-label={ctx.t('command.toggle')}
				onClick={() => toggle(input.session)}
				style={{
					display: 'inline-flex',
					'align-items': 'center',
					'justify-content': 'center',
					width: '24px',
					height: '24px',
					margin: '0',
					padding: '0',
					border: 'none',
					'border-radius': '6px',
					background: 'transparent',
					color: tok.muted,
					cursor: 'pointer',
				}}
			>
				<ui.Icon name={panelIcon} size="small" />
			</button>
		),
	})

	ctx.add(SettingsPage, {
		id: 'oh-my-gui',
		icon: panelIcon,
		get title() {
			return ctx.t('settings.title')
		},
		get entries() {
			return [
				{
					id: 'behavior',
					title: ctx.t('settings.section.behavior'),
					keywords: 'auto open session',
				},
				{ id: 'context', title: 'Context section', keywords: 'context tokens poll' },
				{ id: 'agents', title: 'Agents section', keywords: 'agents tabs' },
				{ id: 'hooks', title: 'Hooks section', keywords: 'hooks events' },
				{ id: 'jobs', title: 'Jobs section', keywords: 'jobs background notify' },
				{ id: 'stats', title: 'Stats section', keywords: 'stats cost streak tools' },
				{ id: 'pill', title: ctx.t('settings.pill'), keywords: 'commit pill jobs' },
				{ id: 'layout', title: ctx.t('settings.section.layout'), keywords: 'width panel' },
			]
		},
		render: (input) => <SettingsView target={input.target} ui={ui} />,
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
		if (id === 'jobs') return p.showJobs !== false
		if (id === 'stats') return p.showStats !== false
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
			const first = (['context', 'agents', 'hooks', 'jobs', 'stats', 'info'] as DashTab[]).find(
				visible,
			)
			if (first) setTab(first)
		}
	})

	const tabIds = () =>
		(['context', 'agents', 'hooks', 'jobs', 'stats', 'info'] as DashTab[]).filter(visible)
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
				border: tab() === p.id ? `1px solid ${tok.border}` : '1px solid transparent',
				'background-color': tab() === p.id ? tok.surfaceRaised : 'transparent',
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
				<Show when={visible('jobs')}>
					<TabButton id="jobs" label={ctx.t('tab.jobs')} />
				</Show>
				<Show when={visible('stats')}>
					<TabButton id="stats" label={ctx.t('tab.stats')} />
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
				<Show when={tab() === 'jobs' && visible('jobs')}>
					<div id="oh-my-gui-panel-jobs" role="tabpanel">
						<JobsView session={props.session} />
					</div>
				</Show>
				<Show when={tab() === 'stats' && visible('stats')}>
					<div id="oh-my-gui-panel-stats" role="tabpanel">
						<StatsView session={props.session} />
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

function SettingsView(props: { target?: string; ui: any }) {
	const ctx = usePlugin<typeof definition>()
	const ui = props.ui
	const p = ctx.stores.prefs as any
	const [configNotice, setConfigNotice] = createSignal('')

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

	const pollOptions = [
		{ value: '2000', label: '2s' },
		{ value: '5000', label: '5s' },
		{ value: '10000', label: '10s' },
		{ value: '15000', label: '15s' },
		{ value: '30000', label: '30s' },
	]

	const warnOptions = [
		{ value: '0', label: 'Off' },
		{ value: '70', label: '70%' },
		{ value: '80', label: '80%' },
		{ value: '90', label: '90%' },
	]

	return (
		<ui.SettingsLayout title={ctx.t('settings.title')} description={ctx.t('settings.description')}>
			<Show when={configNotice()}>
				<div role="status" aria-live="polite" style={{ 'font-size': '12px', opacity: 0.75 }}>
					{configNotice()}
				</div>
			</Show>

			<ui.SettingsSection title={ctx.t('settings.section.behavior')}>
				<ui.SettingsRow
					id="behavior"
					title={ctx.t('settings.autoOpen')}
					description={ctx.t('settings.autoOpen.description')}
				>
					<ui.Switch
						label={ctx.t('settings.autoOpen')}
						hideLabel
						checked={p.value.autoOpen !== false}
						onChange={(v: boolean) => setPref({ autoOpen: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="context-warn"
					title={ctx.t('settings.contextWarnAt')}
					description={ctx.t('settings.contextWarnAt.description')}
				>
					<ui.Select
						label={ctx.t('settings.contextWarnAt')}
						options={warnOptions}
						value={String(Math.max(0, Number(p.value.contextWarnAt) || 0))}
						onChange={(v: string) => setPref({ contextWarnAt: Number(v) || 0 })}
					/>
				</ui.SettingsRow>
			</ui.SettingsSection>

			<ui.SettingsSection title="Context & refresh">
				<ui.SettingsRow id="context" title={ctx.t('settings.showContext')}>
					<ui.Switch
						label={ctx.t('settings.showContext')}
						hideLabel
						checked={p.value.showContext !== false}
						onChange={(v: boolean) => setPref({ showContext: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="poll"
					title={ctx.t('settings.pollMs')}
					description={ctx.t('settings.pollMs.description')}
				>
					<ui.Select
						label={ctx.t('settings.pollMs')}
						options={pollOptions}
						value={String(Number(p.value.pollMs) || 5000)}
						onChange={(v: string) =>
							setPref({
								pollMs: Math.max(2000, Math.min(30000, Number(v) || 5000)),
							})
						}
					/>
				</ui.SettingsRow>
			</ui.SettingsSection>

			<ui.SettingsSection title={ctx.t('settings.section.tabs')}>
				<ui.SettingsRow id="agents" title={ctx.t('settings.showAgents')}>
					<ui.Switch
						label={ctx.t('settings.showAgents')}
						hideLabel
						checked={p.value.showAgents !== false}
						onChange={(v: boolean) => setPref({ showAgents: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="hooks-tab" title={ctx.t('settings.showHooks')}>
					<ui.Switch
						label={ctx.t('settings.showHooks')}
						hideLabel
						checked={p.value.showHooks !== false}
						onChange={(v: boolean) => setPref({ showHooks: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="jobs" title={ctx.t('settings.showJobs')}>
					<ui.Switch
						label={ctx.t('settings.showJobs')}
						hideLabel
						checked={p.value.showJobs !== false}
						onChange={(v: boolean) => setPref({ showJobs: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="stats" title={ctx.t('settings.showStats')}>
					<ui.Switch
						label={ctx.t('settings.showStats')}
						hideLabel
						checked={p.value.showStats !== false}
						onChange={(v: boolean) => setPref({ showStats: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="info" title={ctx.t('settings.showInfo')}>
					<ui.Switch
						label={ctx.t('settings.showInfo')}
						hideLabel
						checked={p.value.showInfo !== false}
						onChange={(v: boolean) => setPref({ showInfo: v })}
					/>
				</ui.SettingsRow>
			</ui.SettingsSection>

			<ui.SettingsSection title={ctx.t('settings.section.hooks')}>
				<ui.SettingsRow
					id="hooks"
					title={ctx.t('settings.maxHooks')}
					description={ctx.t('settings.maxHooks.description')}
				>
					<input
						type="number"
						min="20"
						max="2000"
						step="20"
						value={Number(p.value.maxHooks) || 200}
						onChange={(e) => void applyServerMaxHooks(Number((e.target as HTMLInputElement).value))}
						style={{ width: '120px' }}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="hooks-fetch"
					title={ctx.t('settings.hooksFetchLimit')}
					description={ctx.t('settings.hooksFetchLimit.description')}
				>
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
				</ui.SettingsRow>
			</ui.SettingsSection>

			<ui.SettingsSection title={ctx.t('settings.section.pill')}>
				<ui.SettingsRow
					id="pill"
					title={ctx.t('settings.showCommit')}
					description={ctx.t('settings.showCommit.description')}
				>
					<ui.Switch
						label={ctx.t('settings.showCommit')}
						hideLabel
						checked={p.value.showCommit !== false}
						onChange={(v: boolean) => setPref({ showCommit: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="notify-jobs"
					title={ctx.t('settings.notifyJobs')}
					description={ctx.t('settings.notifyJobs.description')}
				>
					<ui.Switch
						label={ctx.t('settings.notifyJobs')}
						hideLabel
						checked={p.value.notifyJobs !== false}
						onChange={(v: boolean) => setPref({ notifyJobs: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="show-waiting"
					title={ctx.t('settings.showWaiting')}
					description={ctx.t('settings.showWaiting.description')}
				>
					<ui.Switch
						label={ctx.t('settings.showWaiting')}
						hideLabel
						checked={p.value.showWaiting !== false}
						onChange={(v: boolean) => setPref({ showWaiting: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow
					id="notify-waiting"
					title={ctx.t('settings.notifyWaiting')}
					description={ctx.t('settings.notifyWaiting.description')}
				>
					<ui.Switch
						label={ctx.t('settings.notifyWaiting')}
						hideLabel
						checked={p.value.notifyWaiting !== false}
						onChange={(v: boolean) => setPref({ notifyWaiting: v })}
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="commit-confirm" title={ctx.t('settings.commitConfirm')}>
					<input
						type="number"
						min="0"
						max="500"
						step="1"
						value={Math.max(0, Number(p.value.commitConfirmThreshold) || 0)}
						onInput={(e) =>
							setPref({
								commitConfirmThreshold: Math.max(
									0,
									Math.min(500, Math.floor(Number((e.target as HTMLInputElement).value) || 0)),
								),
							})
						}
						style={{ width: '90px' }}
						title="0 disables confirmation"
					/>
				</ui.SettingsRow>
				<ui.SettingsRow id="commit-prompt" title={ctx.t('settings.commitPrompt')}>
					<textarea
						value={typeof p.value.commitPrompt === 'string' ? p.value.commitPrompt : ''}
						onInput={(e) => setPref({ commitPrompt: (e.target as HTMLTextAreaElement).value })}
						placeholder="Leave blank to use the built-in conventional commit prompt (no push)"
						rows={3}
						style={{
							width: '100%',
							'font-size': '12px',
							padding: '6px',
							'border-radius': '6px',
							resize: 'vertical',
						}}
					/>
				</ui.SettingsRow>
			</ui.SettingsSection>

			<ui.SettingsSection title={ctx.t('settings.section.layout')}>
				<ui.SettingsRow
					id="layout"
					title={ctx.t('settings.panelWidth')}
					description={ctx.t('settings.panelWidth.description')}
				>
					<span style={{ 'font-size': '13px', opacity: 0.75 }}>{PANEL_WIDTH}px default</span>
				</ui.SettingsRow>
			</ui.SettingsSection>

			<Show when={props.target}>
				<div style={{ 'font-size': '11px', opacity: 0.55 }}>
					Settings target: <code>{props.target}</code>
				</div>
			</Show>
		</ui.SettingsLayout>
	)
}
