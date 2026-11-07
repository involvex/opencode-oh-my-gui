import { createEffect, onCleanup, untrack } from 'solid-js'

export type PollStatus = 'ok' | 'error' | 'skipped'

export type SessionPollOptions = {
	/** Reactive session id. Effect restarts when it changes. */
	sessionID: () => string
	/** Reset local UI state when the poll loop (re)starts. Runs under untrack. */
	reset?: () => void
	/** One poll iteration. Must not rely on Solid tracking from the effect. */
	tick: (sessionID: string, disposed: () => boolean) => Promise<PollStatus | void>
	/** Base interval in ms (read under untrack each schedule). */
	intervalMs: () => number
	/** Extra delay when the last tick was an error. */
	errorBackoffMs?: (failures: number, base: number) => number
}

/**
 * Poll a session without nesting reactive reads from the tick into the effect.
 * Calling `void tick()` synchronously from createEffect tracks every signal the
 * tick touches (e.g. refreshing), then writing those signals re-enters the
 * effect → stack overflow + request thrash.
 */
export function createSessionPoll(opts: SessionPollOptions) {
	createEffect(() => {
		const sessionID = opts.sessionID()
		let disposed = false
		let timer: ReturnType<typeof setTimeout> | undefined
		let failures = 0

		untrack(() => opts.reset?.())

		const clearTimer = () => {
			if (timer !== undefined) {
				clearTimeout(timer)
				timer = undefined
			}
		}

		const schedule = (status: PollStatus = 'ok') => {
			if (disposed) return
			clearTimer()
			const base = Math.max(2000, untrack(() => opts.intervalMs()) || 5000)
			if (status === 'error') failures += 1
			else if (status === 'ok') failures = 0
			const backoff =
				failures > 0
					? (opts.errorBackoffMs?.(failures, base) ??
						Math.min(60000, base * Math.pow(2, Math.min(failures, 4))))
					: 0
			const ms = status === 'error' ? Math.max(base, backoff) : base
			timer = setTimeout(() => void run(), ms)
		}

		const run = async () => {
			if (disposed) return
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
				schedule('ok')
				return
			}
			try {
				const status = (await opts.tick(sessionID, () => disposed)) ?? 'ok'
				if (!disposed) schedule(status === 'skipped' ? 'ok' : status)
			} catch {
				if (!disposed) schedule('error')
			}
		}

		// Defer so the first tick's signal reads are outside this effect.
		timer = setTimeout(() => void run(), 0)

		onCleanup(() => {
			disposed = true
			clearTimer()
		})
	})
}
