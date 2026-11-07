import * as p from '@clack/prompts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const CONFIG_DIR = join(homedir(), '.config', 'opencode')
const CONFIG_FILE = join(CONFIG_DIR, 'opencode.json')
const PLUGIN_ENTRY_PATH = resolve(dirname(import.meta.path), 'src', 'index.ts')
const PLUGIN_URL = pathToFileURL(PLUGIN_ENTRY_PATH).href

type PluginEntry =
	| string
	| { package: string; options?: Record<string, unknown> }
	| [string, Record<string, unknown>]

interface OpenCodeConfig {
	$schema?: string
	plugins?: PluginEntry[]
	server?: { hostname?: string; port?: number; cors?: string[] }
	[key: string]: unknown
}

const DEFAULT_HOSTNAME = '0.0.0.0'
const DEFAULT_PORT = 4000

function stripJsonComments(input: string): string {
	// Simple JSONC comment stripper
	let result = ''
	let i = 0
	const len = input.length
	let inString = false
	let stringChar = '"'
	while (i < len) {
		const char = input[i]
		const next = input[i + 1]
		if (inString) {
			if (char === '\\') {
				result += char + next
				i += 2
				continue
			}
			if (char === stringChar) {
				inString = false
			}
			result += char
			i++
			continue
		}
		if (char === '"' || char === "'") {
			inString = true
			stringChar = char
			result += char
			i++
			continue
		}
		if (char === '/' && next === '/') {
			// line comment
			i += 2
			while (i < len && input[i] !== '\n' && input[i] !== '\r') i++
			continue
		}
		if (char === '/' && next === '*') {
			// block comment
			i += 2
			while (i < len && !(input[i] === '*' && input[i + 1] === '/')) i++
			i += 2
			continue
		}
		result += char
		i++
	}
	return result
}

function readConfig(): OpenCodeConfig {
	if (!existsSync(CONFIG_FILE)) {
		return { $schema: 'https://opencode.ai/config.json', plugins: [] }
	}
	try {
		const content = readFileSync(CONFIG_FILE, 'utf-8')
		return JSON.parse(stripJsonComments(content)) as OpenCodeConfig
	} catch (err) {
		p.log.warn(`Could not parse existing ${CONFIG_FILE} — starting with a fresh config.`)
		p.log.warn(String(err))
		// Don't overwrite, just return fresh and let user know
		return { $schema: 'https://opencode.ai/config.json', plugins: [] }
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

function isPluginEntry(entry: PluginEntry, url: string): boolean {
	const pkg = pluginPackage(entry)
	if (!pkg) return false
	return (
		pkg === url ||
		pkg === PLUGIN_ENTRY_PATH ||
		pkg.replace(/\/$/, '') === url.replace(/\/$/, '') ||
		pkg.includes('oh-my-gui')
	)
}

function ensureDependencies(): void {
	if (!existsSync(join(dirname(import.meta.path), 'node_modules'))) {
		const sInstall = p.spinner()
		sInstall.start('node_modules not found — running bun install...')
		try {
			execSync('bun install', {
				cwd: dirname(import.meta.path),
				stdio: 'ignore',
			})
			sInstall.stop('Dependencies installed.')
		} catch {
			sInstall.stop('bun install failed. Please run it manually before setup.')
			process.exit(1)
		}
	}
}

p.intro('OpenCode Plugin Setup')

ensureDependencies()

const config = readConfig()
const plugins: PluginEntry[] = Array.isArray(config.plugins) ? config.plugins : []

const already = plugins.some((entry) => isPluginEntry(entry, PLUGIN_URL))

const hostname = await p.text({
	message: 'OpenCode server hostname (bind address)',
	placeholder: DEFAULT_HOSTNAME,
	initialValue: config.server?.hostname ?? DEFAULT_HOSTNAME,
	defaultValue: DEFAULT_HOSTNAME,
})
if (p.isCancel(hostname)) {
	p.cancel('Setup cancelled.')
	process.exit(0)
}

const portRaw = await p.text({
	message: 'OpenCode server port',
	placeholder: String(DEFAULT_PORT),
	initialValue: String(config.server?.port ?? DEFAULT_PORT),
	defaultValue: String(DEFAULT_PORT),
	validate: (v) => {
		const n = Number(v)
		if (!Number.isFinite(n) || n <= 0) return 'Enter a positive port number'
	},
})
if (p.isCancel(portRaw)) {
	p.cancel('Setup cancelled.')
	process.exit(0)
}
const port = Math.floor(Number(portRaw))

const connectUrl = await p.text({
	message: 'Desktop connect URL (blank = http://127.0.0.1:<port>)',
	placeholder: `http://127.0.0.1:${port}`,
	defaultValue: '',
})
if (p.isCancel(connectUrl)) {
	p.cancel('Setup cancelled.')
	process.exit(0)
}

p.note(
	[
		`Plugin path : ${PLUGIN_ENTRY_PATH}`,
		`File URL    : ${PLUGIN_URL}`,
		`Config file : ${CONFIG_FILE}`,
		`Bind        : ${hostname}:${port}`,
		`Connect URL : ${connectUrl || `http://127.0.0.1:${port}`}`,
		already
			? 'Action      : update existing plugin entry + server defaults'
			: 'Action      : register plugin',
	].join('\n'),
	'Will write',
)

const confirmed = await p.confirm({
	message: already
		? `Update plugin options + server defaults in ${CONFIG_FILE}?`
		: `Add this plugin to ${CONFIG_FILE}?`,
	initialValue: true,
})

if (p.isCancel(confirmed) || !confirmed) {
	p.cancel('Setup cancelled.')
	process.exit(0)
}

const sWrite = p.spinner()
sWrite.start('Writing config...')

if (!existsSync(CONFIG_DIR)) {
	mkdirSync(CONFIG_DIR, { recursive: true })
}

// Create backup before modifying
try {
	if (existsSync(CONFIG_FILE)) {
		const backupDir = join(CONFIG_DIR, 'backups')
		if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		writeFileSync(
			join(backupDir, `opencode.${timestamp}.before-setup.bak`),
			readFileSync(CONFIG_FILE, 'utf-8'),
		)
	}
} catch (e) {
	p.log.warn('Could not create backup: ' + e)
}

// Handle both old 'plugin' and new 'plugins' keys
const cfg = config as Record<string, unknown>
if (Array.isArray(cfg.plugin) && !Array.isArray(config.plugins)) {
	config.plugins = cfg.plugin as PluginEntry[]
}

const pluginOptions: Record<string, unknown> = {
	hostname: String(hostname),
	port,
	contributeServer: false,
}
if (typeof connectUrl === 'string' && connectUrl.trim()) {
	pluginOptions.url = connectUrl.trim().replace(/\/+$/, '')
}

const pluginEntry = {
	package: PLUGIN_URL.replace(/\/src\/index\.ts$/, '').replace(/\/$/, ''),
	options: pluginOptions,
}

const currentPlugins = Array.isArray(config.plugins) ? config.plugins : []
config.plugins = already
	? currentPlugins.map((entry) => (isPluginEntry(entry, PLUGIN_URL) ? pluginEntry : entry))
	: [...currentPlugins, pluginEntry]

// Align serve/service defaults (deprecated top-level key still honored by CLI).
config.server = {
	...(typeof config.server === 'object' && config.server ? config.server : {}),
	hostname: String(hostname),
	port,
}

writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')

sWrite.stop('Config updated.')

p.note(
	[
		`✓ Plugin     : ${pluginEntry.package}`,
		`✓ Options    : hostname=${hostname} port=${port}`,
		`✓ Server     : ${hostname}:${port}`,
		`✓ Config     : ${CONFIG_FILE}`,
		'',
		'Also sync the background service if needed:',
		`  opencode service set hostname ${hostname}`,
		`  opencode service set port ${port}`,
		`  opencode service restart`,
		'',
		'In OpenCode Desktop: remove any stale server on :4096,',
		'then pick the Oh My GUI "OpenCode" entry (or add the connect URL).',
		'',
		'Restart OpenCode Desktop for the change to take effect.',
		'To remove this plugin run: bun run unregister',
	].join('\n'),
	'Done',
)

p.outro('Setup complete!')
