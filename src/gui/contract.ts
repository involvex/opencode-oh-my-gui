import { Schema } from 'effect'
import { Ipc } from '@opencode/plugin/gui'

/** Main → window bridge for native MenubarItem actions. */
export const MenuBridge = Ipc.define({
	id: '@involvex/oh-my-gui.menu',
	methods: {
		/** Handshake so the window client attaches before menu clicks. */
		ready: { output: Schema.Boolean },
	},
	events: {
		action: Schema.Struct({ command: Schema.String }),
	},
})
