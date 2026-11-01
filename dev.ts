import { spawn } from 'bun'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const scriptDir = dirname(import.meta.path)

console.log('Starting OpenCode with plugin loaded from source...')
console.log('')

const pluginPath = pathToFileURL(scriptDir).href
console.log(`Plugin path: ${pluginPath}`)

// V2 config: plugins is an array of { package, options? } objects
// See: https://opencode.ai/v2/docs/config
const config = {
	plugins: [{ package: pluginPath }],
}

const OPENCODE_CONFIG_CONTENT = JSON.stringify(config)

console.log(`Starting OpenCode with config: ${OPENCODE_CONFIG_CONTENT}`)

const proc = spawn(['opencode'], {
	env: {
		...process.env,
		OPENCODE_CONFIG_CONTENT,
	},
	stdin: 'inherit',
	stdout: 'inherit',
	stderr: 'inherit',
})

await proc.exited
