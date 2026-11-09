/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MountedSession } from '@opencode/plugin/gui'

/** Normalize a fenced shell block into a single command string. */
export function normalizeShellCode(code: string): string {
	return String(code ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.trim()
}

/**
 * Run a fenced shell block in the session's shell via the OpenCode client.
 * Throws when there is no session client or the command is empty.
 */
export async function runInTerminal(code: string, session?: MountedSession): Promise<void> {
	const command = normalizeShellCode(code)
	if (!command) throw new Error('Empty shell command')

	const ref = session as any
	const client = ref?.server?.client as any
	if (!client?.session?.shell) throw new Error('No session shell client')

	const sessionID = String(ref.id || '')
	if (!sessionID) throw new Error('No session id')

	await client.session.shell({ sessionID, command })
}
