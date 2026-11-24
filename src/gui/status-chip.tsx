 
import { Show } from 'solid-js'
import { usePlugin, type MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { readCompaction, readSessionUsage } from './usage'
import { ensureStoreSynced, waitingCount } from './session-store'
import { runningJobCount, type JobRow } from './jobs-model'
import { tok } from './tokens'

export type StatusChipOpen = (session: MountedSession, tab?: 'context' | 'info' | 'jobs') => void

export function StatusChip(props: {
	session: MountedSession
	active: boolean
	listedJobs: () => JobRow[]
	onOpen: StatusChipOpen
}) {
	const ctx = usePlugin<typeof definition>()
	const ui = ctx.ui

	const compaction = () => readCompaction(props.session)
	const usage = () => readSessionUsage(props.session)
	const waiting = () => {
		ensureStoreSynced(props.session)
		return waitingCount(props.session)
	}
	const jobs = () => runningJobCount(props.session.background ?? [], props.listedJobs())

	const compacting = () => compaction()?.status === 'running'
	const share = () => usage()?.share
	const hasWaiting = () => waiting() > 0
	const hasJobs = () => jobs() > 0
	const visible = () => compacting() || share() != null || hasWaiting() || hasJobs()

	const primaryIcon = () => {
		if (compacting()) return ctx.icons.compacting
		if (hasWaiting()) return ctx.icons.waiting
		if (hasJobs()) return ctx.icons.jobs
		return ctx.icons.panel
	}

	const openTab = () => {
		if (compacting() || share() != null) {
			props.onOpen(props.session, 'context')
			return
		}
		if (hasWaiting()) {
			props.onOpen(props.session, 'info')
			return
		}
		if (hasJobs()) {
			props.onOpen(props.session, 'jobs')
			return
		}
		props.onOpen(props.session)
	}

	return (
		<Show when={visible()}>
			<button
				type="button"
				class="oh-my-gui-btn"
				data-oh-my-gui
				title={ctx.t('slot.status.title')}
				aria-label={ctx.t('slot.status.open')}
				onClick={openTab}
				style={{
					display: 'inline-flex',
					'align-items': 'center',
					gap: '6px',
					margin: '0',
					padding: '2px 8px',
					border: `1px solid ${tok.border}`,
					'border-radius': '999px',
					background: props.active ? tok.surface : 'transparent',
					color: tok.muted,
					cursor: 'pointer',
					'font-size': '11px',
					'font-family': 'inherit',
					'line-height': '1.2',
					'white-space': 'nowrap',
					opacity: props.active ? 1 : 0.72,
				}}
			>
				<ui.Icon name={primaryIcon()} size="small" />
				<Show when={compacting()}>
					<span>{ctx.t('slot.status.compacting')}</span>
				</Show>
				<Show when={!compacting() && share() != null}>
					<span>{ctx.t('slot.status.ctx', { pct: String(Math.round(share()!)) })}</span>
				</Show>
				<Show when={hasWaiting()}>
					<span style={{ display: 'inline-flex', 'align-items': 'center', gap: '3px' }}>
						<ui.Icon name={ctx.icons.waiting} size="small" />
						{ctx.t('slot.status.waiting', { count: String(waiting()) })}
					</span>
				</Show>
				<Show when={hasJobs()}>
					<span style={{ display: 'inline-flex', 'align-items': 'center', gap: '3px' }}>
						<ui.Icon name={ctx.icons.jobs} size="small" />
						{jobs() === 1
							? ctx.t('slot.status.jobs', { count: '1' })
							: ctx.t('slot.status.jobs.plural', { count: String(jobs()) })}
					</span>
				</Show>
			</button>
		</Show>
	)
}
