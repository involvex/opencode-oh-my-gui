/**
 * Plugin options from `opencode.json`:
 *
 * ```jsonc
 * {
 *   "plugins": [{
 *     "package": "file://D:/repos/opencode-plugins/oh-my-gui",
 *     "options": {
 *       "hostname": "0.0.0.0",
 *       "port": 4000,
 *       "url": "http://192.168.178.90:4000",
 *       "password": "{env:OPENCODE_SERVER_PASSWORD}",
 *       "contributeServer": true
 *     }
 *   }]
 * }
 * ```
 *
 * - `hostname` / `port` describe the OpenCode HTTP bind (defaults match
 *   `opencode service set hostname/port`). They do not start a second listener;
 *   the OpenCode service already owns the socket.
 * - `url` is the Desktop connect URL. When omitted, wildcard bind hosts
 *   (`0.0.0.0`, `::`) resolve to `http://127.0.0.1:<port>`.
 * - `contributeServer` (default true) registers that URL as a Desktop server
 *   entry so the app stops probing a stale host:port.
 */

export const DEFAULT_HOSTNAME = '0.0.0.0'
export const DEFAULT_PORT = 4000

export type OhMyGuiOptions = {
	hostname?: string
	port?: number | string
	/** Full base URL for Desktop / clients. Overrides hostname+port for connect. */
	url?: string
	/** HTTP basic password (username is always `opencode`). */
	password?: string
	/**
	 * Register a Desktop Server entry. Defaults to false — plugin-contributed
	 * rows only show Edit (no Remove), so leave this off unless you need it.
	 */
	contributeServer?: boolean
}

export type ResolvedOhMyGuiOptions = {
	hostname: string
	port: number
	/** Client-facing base URL (never `0.0.0.0`). */
	url: string
	password?: string
	contributeServer: boolean
}

function parsePort(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value)
	}
	if (typeof value === 'string' && value.trim()) {
		const n = Number(value.trim())
		if (Number.isFinite(n) && n > 0) return Math.floor(n)
	}
	return fallback
}

function isWildcardHost(hostname: string): boolean {
	const h = hostname.trim().toLowerCase()
	return h === '0.0.0.0' || h === '::' || h === '[::]' || h === '*'
}

/** Host clients should dial when `hostname` is a bind address. */
export function connectHost(hostname: string): string {
	const h = hostname.trim() || DEFAULT_HOSTNAME
	if (isWildcardHost(h)) return '127.0.0.1'
	return h.replace(/^\[(.*)\]$/, '$1')
}

export function resolveOptions(raw: unknown): ResolvedOhMyGuiOptions {
	const opts = (raw && typeof raw === 'object' ? raw : {}) as OhMyGuiOptions
	const hostname =
		typeof opts.hostname === 'string' && opts.hostname.trim()
			? opts.hostname.trim()
			: DEFAULT_HOSTNAME
	const port = parsePort(opts.port, DEFAULT_PORT)
	const password =
		typeof opts.password === 'string' && opts.password.length > 0 ? opts.password : undefined

	let url = typeof opts.url === 'string' && opts.url.trim() ? opts.url.trim() : ''
	if (!url) {
		const host = connectHost(hostname)
		const needsBrackets = host.includes(':') && !host.startsWith('[')
		url = `http://${needsBrackets ? `[${host}]` : host}:${port}`
	} else {
		url = url.replace(/\/+$/, '')
	}

	const contributeServer = opts.contributeServer === true

	return { hostname, port, url, password, contributeServer }
}
