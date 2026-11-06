/* eslint-disable @typescript-eslint/no-explicit-any */
import { Changes } from '@opencode/plugin/gui/review'
import { createKeyed } from '@opencode/plugin/gui'
import type { MountedSession, SetupContext } from '@opencode/plugin/gui'

export const EMPTY = { count: 0, files: [] as readonly string[] }

export const COMMIT_FALLBACK_PROMPT =
	'Commit the uncommitted changes in this repository (git add the relevant files, write a conventional-commit message). Do not push.'

export function useCommitChanges(ctx: SetupContext<unknown>) {
	const review = ctx.use(Changes)

	createKeyed(
		() => {
			const live = review()
			const screen = ctx.screen.current()
			if (live.status !== 'active' || !screen) return undefined
			return { changes: live.value, screen }
		},
		(key: any) => {
			try {
				key?.changes?.watch?.(key?.screen, 'details')
			} catch {
				/* ignore */
			}
		},
		{
			equals: (a: any, b: any) => a?.changes === b?.changes && a?.screen === b?.screen,
		},
	)

	return (session: MountedSession) => {
		const live = review()
		if (live.status !== 'active') return EMPTY
		try {
			const diffs = (live.value as any)?.details?.(session)
			if (!diffs) return EMPTY
			const files = (diffs as Array<{ file?: string }>)
				.map((d) => d?.file)
				.filter(Boolean) as string[]
			return { count: files.length, files }
		} catch {
			return EMPTY
		}
	}
}

export async function sendCommit(session: MountedSession) {
	const client = (session as any).server?.client as any
	if (!client) throw new Error('No client')

	try {
		const commands = await client.command?.list?.({
			location: { directory: (session as any).directory },
		})
		const list = ((commands?.data ?? commands) as unknown[]) ?? []
		const has = Array.isArray(list) && list.some((c) => (c as { name?: string })?.name === 'commit')
		if (has && client.session?.command) {
			return await client.session.command({
				sessionID: (session as any).id,
				name: 'commit',
				text: '',
				delivery: 'queue',
			})
		}
	} catch {
		/* fall through */
	}

	if (client.session?.prompt) {
		return await client.session.prompt({
			sessionID: (session as any).id,
			text: COMMIT_FALLBACK_PROMPT,
		})
	}
	throw new Error('Unable to send commit')
}
