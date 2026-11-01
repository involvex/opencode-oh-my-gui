import { Schema } from 'effect'
import { Plugin, Store } from '@opencode/plugin/gui'

export const definition = Plugin.define({
	os: ['windows', 'macos', 'linux'],
	stores: {
		prefs: Store.global(
			Schema.Struct({
				showContext: Schema.Boolean,
				showAgents: Schema.Boolean,
				showHooks: Schema.Boolean,
				showInfo: Schema.Boolean,
				pollMs: Schema.Number,
			}),
			{ showContext: true, showAgents: true, showHooks: true, showInfo: true, pollMs: 1500 },
		),
	},
	i18n: {
		en: {
			title: 'Oh My GUI',
			'command.toggle': 'Toggle Oh My GUI panel',
			'command.toggle.slash': 'omg',
			'panel.title': 'Oh My GUI',
			'tab.context': 'Context',
			'tab.agents': 'Agents',
			'tab.hooks': 'Hooks',
			'tab.info': 'Info',
			'pill.context': 'ctx',
			'settings.title': 'Oh My GUI',
		},
	},
})
