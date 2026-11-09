/** Host theme CSS tokens with fallbacks for Oh My GUI panel UI. */
export const tok = {
	border: 'var(--border, rgba(128,128,128,0.2))',
	surface: 'var(--surface, rgba(128,128,128,0.06))',
	surfaceRaised: 'var(--surface-raised, rgba(128,128,128,0.1))',
	error: 'var(--error, #f87171)',
	warning: 'var(--warning, #fbbf24)',
	success: 'var(--success, #22c55e)',
	info: 'var(--info, #60a5fa)',
	primary: 'var(--primary, #6ea8d9)',
	muted: 'var(--text-muted, rgba(128,128,128,0.65))',
	track: 'var(--surface-raised, rgba(128,128,128,0.12))',
} as const

export const SERIES = [
	['system', 'System', 'var(--info, #60a5fa)'],
	['toolSchemas', 'Tool schemas', 'var(--primary, #a78bfa)'],
	['user', 'User', 'var(--success, #34d399)'],
	['assistant', 'Assistant', 'var(--info, #22d3ee)'],
	['reasoning', 'Reasoning', 'var(--primary, #f472b6)'],
	['toolArgs', 'Tool args', 'var(--warning, #fbbf24)'],
	['toolOut', 'Tool output', 'var(--warning, #fb923c)'],
	['other', 'Other', 'var(--text-muted, #94a3b8)'],
] as const

export function pctTone(pct: number | null): string {
	if (pct === null) return tok.muted
	if (pct >= 90) return tok.error
	if (pct >= 70) return tok.warning
	return tok.success
}
