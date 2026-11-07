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
				showCommit: Schema.optional(Schema.Boolean),
				commitConfirmThreshold: Schema.optional(Schema.Number),
				commitPrompt: Schema.optional(Schema.String),
				pollMs: Schema.Number,
				maxHooks: Schema.optional(Schema.Number),
				hooksFetchLimit: Schema.optional(Schema.Number),
			}),
			{
				showContext: true,
				showAgents: true,
				showHooks: true,
				showInfo: true,
				showCommit: true,
				commitConfirmThreshold: 0,
				commitPrompt: '',
				pollMs: 5000,
				maxHooks: 200,
				hooksFetchLimit: 80,
			},
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
			'pill.commit': 'Commit',
			'pill.commit.title': 'Commit the uncommitted changes in this repo',
			'pill.commit.busy': 'Committing…',
			'pill.commit.confirm': 'Send /commit for {count} changed files?',
			'toast.commit.failed': 'Could not send /commit',
			'settings.title': 'Oh My GUI',
			'settings.pill': 'Composer pill',
			'settings.showCommit': 'Show Commit pill',
			'settings.commitConfirm': 'Confirm before commit when changed files reach',
			'settings.commitPrompt': 'Commit fallback prompt (blank = default)',
			'toast.copied': 'Copied',
			'toast.copyFailed': 'Copy failed',
		},
	},
})
