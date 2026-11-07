import * as p from '@clack/prompts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CONFIG_FILE = join(homedir(), '.config', 'opencode', 'opencode.json')
const PLUGIN_ENTRY_PATH = resolve(dirname(import.meta.path), 'src', 'index.ts')
const PLUGIN_URL = pathToFileURL(PLUGIN_ENTRY_PATH).href

type PluginEntry =
	| string
	| { package: string; options?: Record<string, unknown> }
	| [string, Record<string, unknown>]

interface OpenCodeConfig {
	$schema?: string
	plugins?: PluginEntry[]
	[key: string]: unknown
}

function readConfig(): OpenCodeConfig {
	if (!existsSync(CONFIG_FILE)) {
		p.log.warn(`Config file not found: ${CONFIG_FILE}`)
		p.log.info('Nothing to unregister.')
		process.exit(0)
	}
	try {
		return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as OpenCodeConfig
	} catch {
		p.log.warn(`Could not parse ${CONFIG_FILE}.`)
		process.exit(1)
	}
}

function pluginPackage(entry: PluginEntry): string | undefined {
	if (typeof entry === 'string') return entry
	if (Array.isArray(entry)) return entry[0]
	if (entry && typeof entry === 'object' && typeof entry.package === 'string') {
		return entry.package
	}
	return undefined
}

function isPluginEntry(entry: PluginEntry, _url: string): boolean {
	const pkg = pluginPackage(entry)
	return !!pkg && (pkg.includes('oh-my-gui') || pkg === PLUGIN_URL || pkg === PLUGIN_ENTRY_PATH)
}

p.intro('OpenCode Plugin Unregister')

const config = readConfig()
const plugins: PluginEntry[] = Array.isArray(config.plugins) ? config.plugins : []

if (!plugins.some((entry) => isPluginEntry(entry, PLUGIN_URL))) {
	p.note(PLUGIN_URL, 'Not registered')
	p.outro('Plugin is not in your global OpenCode config. Nothing to remove.')
	process.exit(0)
}

p.note([`Plugin URL  : ${PLUGIN_URL}`, `Config file : ${CONFIG_FILE}`].join('\n'), 'Will remove')

const confirmed = await p.confirm({
	message: `Remove this plugin from ${CONFIG_FILE}?`,
	initialValue: true,
})

if (p.isCancel(confirmed) || !confirmed) {
	p.cancel('Unregister cancelled.')
	process.exit(0)
}

const sWrite = p.spinner()
sWrite.start('Updating config...')

config.plugins = plugins.filter((entry) => !isPluginEntry(entry, PLUGIN_URL))
writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')

sWrite.stop('Config updated.')

p.note(
	[
		`✓ Removed   : ${PLUGIN_URL}`,
		`✓ Config    : ${CONFIG_FILE}`,
		'',
		'Restart OpenCode for the change to take effect.',
		'To re-register run: bun run setup',
	].join('\n'),
	'Done',
)

p.outro('Plugin unregistered successfully!')
