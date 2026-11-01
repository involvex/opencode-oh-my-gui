import { Schema } from 'effect'
import { Ipc } from '@opencode/plugin/gui'

export const OhMyGuiIpc = Ipc.define({
	id: '@involvex/oh-my-gui.ipc',
	methods: {
		ping: { output: Schema.String },
	},
})
