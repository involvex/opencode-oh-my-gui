/* eslint-disable @typescript-eslint/no-explicit-any */

export type JobKind = 'shell' | 'subagent' | 'image' | 'codemode' | string
export type JobStatus = 'running' | 'completed' | 'error' | 'cancelled' | string

export type JobRow = {
	id: string
	kind: JobKind
	status: JobStatus
	/** Display status; shell `timeout` is shown as still running. */
	displayStatus: string
	title: string
	detail?: string
	sessionID: string
	childSessionID?: string
	command?: string
	agent?: string
	path?: string
	model?: string
	started?: number
	completed?: number
	source: 'live' | 'history'
}

export function ageLabel(started?: number) {
	if (!started || !Number.isFinite(started)) return ''
	const sec = Math.max(0, Math.floor((Date.now() - started) / 1000))
	if (sec < 60) return `${sec}s`
	if (sec < 3600) return `${Math.floor(sec / 60)}m`
	return `${Math.floor(sec / 3600)}h`
}

/** Shell timeout stays alive in 2.3.1 — show as running, not failed. */
export function displayStatusFor(kind: string, status: string): string {
	const s = String(status || '').toLowerCase()
	if (s === 'timeout' || (kind === 'shell' && s === 'timeout')) return 'running'
	if (s === 'pending') return 'running'
	return status || 'unknown'
}

export function isRunningStatus(kind: string, status: string): boolean {
	const d = displayStatusFor(kind, status).toLowerCase()
	return d === 'running' || d === 'pending' || d === 'timeout'
}

export function statusColor(
	status: string,
	palette: { error: string; warning: string; success: string; muted: string },
) {
	const s = status.toLowerCase()
	if (s === 'error' || s === 'failed') return palette.error
	if (s === 'running' || s === 'pending' || s === 'timeout') return palette.warning
	if (s === 'completed' || s === 'succeeded' || s === 'cancelled') {
		return s === 'cancelled' ? palette.muted : palette.success
	}
	return palette.muted
}

export function jobFromLive(
	task: {
		id: string
		type: string
		label: string
		agent?: string
	},
	sessionID: string,
): JobRow {
	const kind = task.type
	return {
		id: task.id,
		kind,
		status: 'running',
		displayStatus: 'running',
		title: task.label || task.agent || task.type,
		detail: kind === 'subagent' && task.agent ? task.agent : undefined,
		sessionID,
		childSessionID: kind === 'subagent' ? task.id : undefined,
		agent: task.agent,
		source: 'live',
	}
}

export function jobFromList(j: any, fallbackSessionID: string): JobRow | null {
	const id = String(j?.id ?? '')
	if (!id) return null
	const kind = String(j?.kind ?? '')
	const rawStatus = String(j?.status ?? '')
	const title =
		String(j?.title ?? j?.description ?? j?.command ?? j?.agent ?? j?.path ?? j?.kind ?? '') ||
		String(j?.kind ?? 'job')

	const detailParts: string[] = []
	if (kind === 'shell' && j?.command) detailParts.push(String(j.command))
	if (kind === 'subagent') {
		if (j?.agent) detailParts.push(String(j.agent))
		if (j?.description && j.description !== j.title) detailParts.push(String(j.description))
	}
	if (kind === 'image') {
		if (j?.model) detailParts.push(String(j.model))
		if (j?.path) detailParts.push(String(j.path))
	}

	return {
		id,
		kind,
		status: rawStatus,
		displayStatus: displayStatusFor(kind, rawStatus),
		title,
		detail: detailParts.length ? detailParts.join(' · ') : undefined,
		sessionID: String(j?.sessionID ?? fallbackSessionID),
		childSessionID: j?.childSessionID ? String(j.childSessionID) : undefined,
		command: j?.command ? String(j.command) : undefined,
		agent: j?.agent ? String(j.agent) : undefined,
		path: j?.path ? String(j.path) : undefined,
		model: j?.model ? String(j.model) : undefined,
		started: typeof j?.time?.started === 'number' ? j.time.started : undefined,
		completed: typeof j?.time?.completed === 'number' ? j.time.completed : undefined,
		source: 'history',
	}
}

/** Running count for the jobs pill: live background + listed image/codemode still running. */
export function runningJobCount(
	liveBackground: readonly { id: string; type: string }[],
	listed: readonly JobRow[],
): number {
	const liveIds = new Set(liveBackground.map((t) => t.id))
	let count = liveBackground.length
	for (const row of listed) {
		if (liveIds.has(row.id)) continue
		if (row.kind !== 'image' && row.kind !== 'codemode') continue
		if (!isRunningStatus(row.kind, row.status)) continue
		count += 1
	}
	return count
}

export async function fetchJobList(
	client: any,
	sessionID: string,
	descendants = true,
): Promise<{ supported: boolean; rows: JobRow[] }> {
	const list = client?.experimental?.job?.list
	if (typeof list !== 'function') {
		return { supported: false, rows: [] }
	}
	const res = await list.call(client.experimental.job, {
		sessionID,
		descendants,
	})
	const items = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []
	const rows = items
		.map((j: any) => jobFromList(j, sessionID))
		.filter((r: JobRow | null): r is JobRow => !!r)
	return { supported: true, rows }
}
