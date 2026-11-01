import type { Plugin } from '@opencode/plugin/gui'
import { OhMyGuiIpc } from './contract'

export const main: Plugin.MainSetup = (ctx) => {
	ctx.provide(OhMyGuiIpc, {
		ping: async () => 'pong',
	})
	console.log('[@involvex/oh-my-gui] GUI main in Electron process')
}
