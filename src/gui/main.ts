import type { BrowserWindow } from 'electron'
import type { Plugin } from '@opencode/plugin/gui'
import { MenubarItem } from '@opencode/plugin/gui/main'
import { MenuBridge } from './contract'

type MenuCommand =
	| 'toggle'
	| 'open.context'
	| 'open.agents'
	| 'open.hooks'
	| 'open.jobs'
	| 'open.stats'
	| 'open.info'
	| 'copy-diagnostics'

const VIEW_ITEMS: Array<{
	id: MenuCommand
	labelKey: string
	after?: string
}> = [
	{ id: 'toggle', labelKey: 'menu.toggle' },
	{ id: 'open.context', labelKey: 'menu.open.context', after: 'toggle' },
	{ id: 'open.agents', labelKey: 'menu.open.agents', after: 'open.context' },
	{ id: 'open.hooks', labelKey: 'menu.open.hooks', after: 'open.agents' },
	{ id: 'open.jobs', labelKey: 'menu.open.jobs', after: 'open.hooks' },
	{ id: 'open.stats', labelKey: 'menu.open.stats', after: 'open.jobs' },
	{ id: 'open.info', labelKey: 'menu.open.info', after: 'open.stats' },
]

export const main: Plugin.MainSetup = (ctx) => {
	const provider = ctx.provide(MenuBridge, {
		ready: () => true,
	})

	const dispatch = (command: MenuCommand, window: BrowserWindow | undefined) => {
		const target = window ?? ctx.windows.focused()
		target?.webContents.focus()
		const windowId = target?.id
		if (windowId != null) {
			provider.emit('action', { command }, windowId)
			return
		}
		provider.emit('action', { command })
	}

	for (const item of VIEW_ITEMS) {
		ctx.add(MenubarItem, (): MenubarItem => ({
			menu: 'view',
			id: item.id,
			after: item.after,
			get label() {
				return ctx.t(item.labelKey)
			},
			run: (window) => dispatch(item.id, window),
		}))
	}

	ctx.add(MenubarItem, (): MenubarItem => ({
		menu: 'help',
		id: 'copy-diagnostics',
		after: 'logs.export',
		get label() {
			return ctx.t('menu.copyDiagnostics')
		},
		run: (window) => dispatch('copy-diagnostics', window),
	}))

	ctx.log.write('info', 'oh-my-gui menubar registered', {
		viewItems: VIEW_ITEMS.length,
		helpItems: 1,
	})

	return () => {
		provider.dispose()
	}
}
