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

type PluginEntry = string | { package: string; options?: Record<string, unknown> }

interface OpenCodeConfig {
	$schema?: string
	plugins?: PluginEntry[]
	[key: string]: unknown
}

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

function isPluginEntry(entry: PluginEntry, url: string): boolean {
	return typeof entry === 'object' && entry !== null && entry.package === url
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

if (plugins.some((entry) => isPluginEntry(entry, PLUGIN_URL))) {
	p.note(PLUGIN_URL, 'Already registered')
	p.outro('Plugin is already in your global OpenCode config. Nothing to do.')
	process.exit(0)
}

p.note(
	[
		`Plugin path : ${PLUGIN_ENTRY_PATH}`,
		`File URL    : ${PLUGIN_URL}`,
		`Config file : ${CONFIG_FILE}`,
	].join('\n'),
	'Will register',
)

const confirmed = await p.confirm({
	message: `Add this plugin to ${CONFIG_FILE}?`,
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
if (Array.isArray((config as any).plugin) && !Array.isArray(config.plugins)) {
	config.plugins = (config as any).plugin
}
const currentPlugins = Array.isArray(config.plugins) ? config.plugins : []
config.plugins = [...currentPlugins, { package: PLUGIN_URL }]
writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')

sWrite.stop('Config updated.')

p.note(
	[
		`✓ Registered: ${PLUGIN_URL}`,
		`✓ Config    : ${CONFIG_FILE}`,
		'',
		'Restart OpenCode for the change to take effect.',
		'To remove this plugin run: bun run unregister',
	].join('\n'),
	'Done',
)

p.outro('Setup complete!')
