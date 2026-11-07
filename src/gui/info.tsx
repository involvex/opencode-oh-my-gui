/* eslint-disable @typescript-eslint/no-explicit-any */
import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { usePlugin } from '@opencode/plugin/gui'
import type { MountedSession } from '@opencode/plugin/gui'
import type { definition } from './definition'
import { DashboardRpc } from '../rpc'

export function InfoView(props: { session: MountedSession }) {
	const ctx = usePlugin<typeof definition>()
	const [data, setData] = createSignal<any>(null)
	const [error, setError] = createSignal('')
	const [loaded, setLoaded] = createSignal(false)
	const [notice, setNotice] = createSignal('')

	createEffect(() => {
		const sessionID = props.session.id
		const ms = Math.max(500, Number((ctx.stores.prefs.value as any).pollMs) || 3000)
		let pending = false
		let disposed = false
		setLoaded(false)
		setData(null)
		setError('')
		const load = async () => {
			if (disposed || pending) return
			pending = true
			try {
				const result = (await ctx.client.rpc(DashboardRpc).overview({ sessionID })) as any
				if (disposed) return
				setData(result?.data ?? null)
				setError('')
			} catch (err) {
				if (disposed) return
				setError(err instanceof Error ? err.message : String(err))
			} finally {
				pending = false
				if (!disposed) setLoaded(true)
			}
		}
		void load()
		const timer = setInterval(() => void load(), ms)
		onCleanup(() => {
			disposed = true
			clearInterval(timer)
		})
	})

	const copyDiagnostics = async () => {
		try {
			const client = ctx.client.rpc(DashboardRpc)
			const [ov, ctxRes, hk] = await Promise.all([
				client.overview({ sessionID: props.session.id }).catch(() => null),
				client.context({ sessionID: props.session.id }).catch(() => null),
				client.hooks({ sessionID: props.session.id, limit: 50 }).catch(() => null),
			])
			const bundle = {
				generatedAt: new Date().toISOString(),
				sessionID: props.session.id,
				overview: (ov as any)?.data ?? d() ?? null,
				context: (ctxRes as any)?.rows ?? [],
				hooks: (hk as any)?.entries ?? [],
			}
			const text = JSON.stringify(bundle, null, 2)
			if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text)
			else console.log(text)
			setNotice('Diagnostics copied (sanitized)')
		} catch (err) {
			setNotice(err instanceof Error ? err.message : String(err))
		}
		setTimeout(() => setNotice(''), 1800)
	}

	const d = () => data()
	return (
		<div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'font-size': '12px' }}>
			<div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
				<button type="button" onClick={() => void copyDiagnostics()}>
					Copy diagnostics
				</button>
				<Show when={notice()}>
					<span style={{ 'font-size': '11px', opacity: 0.7 }}>{notice()}</span>
				</Show>
			</div>
			<Show when={loaded()} fallback={<div>Loading info...</div>}>
				<Show when={error()}>
					<div>Unavailable: {error()}</div>
				</Show>
				<Show when={d()}>
					{(x) => (
						<>
							<div>
								<b>Session:</b> {x().sessionID}
							</div>
							<div>
								<b>Agent:</b> {x().agent || '—'}
							</div>
							<div>
								<b>Model:</b> {x().modelID || '—'}
							</div>
							<div>
								<b>Provider:</b> {x().providerID || '—'}
							</div>
							<div>
								<b>Directory:</b> {x().directory || '—'}
							</div>
							<div>
								<b>Git branch:</b> {x().gitBranch || '—'}
							</div>
							<div>
								<b>MCP:</b> {(x().mcp || []).join(', ') || '—'}
							</div>
							<div>
								<b>Todos:</b> {x().todos}
							</div>
							<div>
								<b>Updated:</b> {x().updatedAt}
							</div>
						</>
					)}
				</Show>
			</Show>
		</div>
	)
}
