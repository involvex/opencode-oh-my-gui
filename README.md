# @involvex/oh-my-gui

OpenCode V2 desktop GUI plugin: session dashboard (context, agents, hooks, jobs, info), live usage from the session store, composer pills, and Appearance themes.

**Requires OpenCode Desktop / `@opencode/plugin` ≥ 2.3.2.**

## Installation

Add to your `opencode.jsonc` (Desktop) or `opencode.json` using the V2 config format:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": [{ "package": "@involvex/oh-my-gui@latest" }]
}
```

OpenCode will automatically install the plugin on next launch.

This plugin does **not** open its own HTTP socket — OpenCode's service / `opencode serve` does. Configure hostname and port with `opencode service set` or a top-level `server` block for `opencode serve`. Optional plugin `hostname` / `port` / `url` values are only for your own tooling; leave `contributeServer` false (default). Desktop plugin-owned server rows cannot be removed from the UI.

V2 plugin shape is `{ "package", "options" }` (not the old `["pkg", opts]` tuple).

## Quick Start (Global Registration)

The fastest way to load your plugin into OpenCode globally:

```bash
bun run setup
```

This will:

1. Install dependencies (if `node_modules/` is missing)
2. Prompt for confirmation
3. Add your plugin to `~/.config/opencode/opencode.json` using its absolute `file:///` path

Then **restart OpenCode** — your plugin is live.

To remove it:

```bash
bun run unregister
```

## Desktop GUI features

| Feature         | How                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| Side panel      | Session panel menu, `Ctrl+\``, or `/omg`                                  |
| Auto-open       | On by default for new session tabs; toggle in Settings → Oh My GUI        |
| Panel width     | Defaults to 380px; drag the divider (remembered per panel)                |
| Themes          | **Oh My GUI** and **Oh My GUI Dawn** in Settings → Appearance → Theme     |
| Live context    | Composer pill and Context tab read official tokens, cost, and window      |
| Compaction      | Pill shows Compacting… while a summary runs; Context shows cost/tokens    |
| Cache write     | Provider token card shows cache read and cache write                      |
| Allowance       | Context tab shows OpenCode Go meters and Console budgets when available   |
| Context warning | Toast once per session when usage crosses the threshold (default 80%)     |
| Jobs            | Jobs tab + pill for shell, subagent, image, and codemode; optional notify |
| Waiting         | Pill + Info list for permissions, forms, and stranded/queued prompts      |
| Commit pill     | Appears when the repo has uncommitted changes                             |
| Goal            | Info tab shows the session goal from `opencode.goal` when present         |
| Hook quote      | Attach a hook detail as a composer quote                                  |
| Run shell fence | “Run in terminal” on `sh` / `bash` / `powershell` / `cmd` code blocks     |
| Fork parent     | Info tab shows parent session with Open when the session was forked       |

```bash
# GUI bundle (required for Desktop)
bun run build:gui

# Watch while developing against Desktop
bun run dev:gui
```

## Development

```bash
# Install dependencies
bun install

# Run OpenCode with the plugin loaded from source
bun dev

# Typecheck
bun typecheck
```

### Project Structure

```
@involvex/oh-my-gui/
├── src/
│   ├── index.ts           # Server plugin (hooks + DashboardRpc)
│   ├── gui.tsx            # Desktop GUI entry
│   └── gui/               # Panel views, themes, settings
├── dist/gui-experimental.cjs
├── setup.ts
├── unregister.ts
├── dev.ts
└── ...
```

### Plugin Architecture

V2 plugins use `Plugin.define({ id, setup(ctx) })`:

```typescript
import { Plugin } from '@opencode/plugin'

export default Plugin.define({
	id: '@involvex/oh-my-gui',
	setup(ctx) {
		// ctx provides domain services:
		// - app: { name, version, channel }
		// - location: { directory, project: { id, directory, canonical } }
		// - options: PluginOptions (from config)
		// - storage: { get, set, remove, scan }
		// - tool: ToolDomain — transform, list, hook
		// - session: SessionDomain — hook
		// - event: subscribe
		// - permission: hook('evaluate')
		// - shell: hook('create.before')
		// - command: transform
		// - etc.

		// Register hooks and tools programmatically:
		// ctx.event.subscribe(({ event }) => { ... })
		// ctx.session.hook('prompt', ({ prompt }) => { ... })
		// ctx.tool.hook('execute.before', ({ tool, input }) => { ... })
		// ctx.permission.hook('evaluate', ({ effect }) => { ... })

		return async () => {
			// optional cleanup
		}
	},
})
```

### Available Hooks

Hooks are registered programmatically via domain `.hook()` APIs. Key hooks:

| Domain           | Hook Registration            | Description                                |
| ---------------- | ---------------------------- | ------------------------------------------ |
| `ctx.event`      | `subscribe(cb)`              | Subscribe to events (session.idle, etc.)   |
| `ctx.session`    | `hook('prompt', cb)`         | Intercept/modify user prompts              |
| `ctx.session`    | `hook('context', cb)`        | Modify LLM params, system prompt, messages |
| `ctx.session`    | `hook('compaction', cb)`     | Customize session compaction               |
| `ctx.session`    | `hook('model.request', cb)`  | Add headers to LLM requests                |
| `ctx.tool`       | `hook('execute.before', cb)` | Before tool execution                      |
| `ctx.tool`       | `hook('execute.after', cb)`  | After tool execution                       |
| `ctx.permission` | `hook('evaluate', cb)`       | Auto-allow/deny permissions                |
| `ctx.shell`      | `hook('create.before', cb)`  | Inject env vars into shell                 |

See `src/index.ts` for all available hooks with descriptions.

### Logging

Use `console.log` for logging:

```typescript
console.log('@involvex/oh-my-gui something happened')
```

### Custom Tools

V2 tools use Effect's `Schema` for input validation:

```typescript
import { Plugin } from '@opencode/plugin'
import { Effect, Schema } from 'effect'

export default Plugin.define({
	id: '@involvex/oh-my-gui',
	setup(ctx) {
		ctx.tool.transform((editor) => {
			editor.add({
				name: 'mytool',
				description: 'What this tool does',
				input: Schema.Struct({
					input: Schema.String,
				}),
				execute: ({ input }) => {
					return Effect.succeed({
						content: [{ type: 'text' as const, text: `Result: ${input}` }],
					})
				},
			})
		})
	},
})
```

## Publishing

```bash
npm publish
```

After publishing, users can install with V2 config format:

```json
{
	"plugins": [{ "package": "@involvex/oh-my-gui@latest" }]
}
```

## V1 → V2 Migration

If you're migrating from V1:

| V1 (Old)                                    | V2 (New)                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `@opencode-ai/plugin`                       | `@opencode/plugin`                                                      |
| `@opencode-ai/sdk`                          | `@opencode/sdk`                                                         |
| `export const MyPlugin = async (ctx) => {}` | `export default Plugin.define({ id, setup(ctx) => {} })`                |
| Return hooks from setup                     | Register via `ctx.domain.hook()`                                        |
| `tool.schema.string()`                      | `Schema.String` from `effect`                                           |
| `ctx.client.app.log()`                      | `console.log`                                                           |
| `"plugin": ["name"]`                        | `"plugins": [{ "package": "name" }]`                                    |
| `permission.ask` with `output.status`       | `ctx.permission.hook('evaluate', ({ effect }) => { effect = 'allow' })` |

## Commit pill

A "Commit N" pill appears next to the context pill in the composer when there are uncommitted changes in the session's repository. Clicking it sends `/commit` to the current session (queued). The pill reads changes from the review view and hides automatically once the repository is clean.

## Context and jobs (0.6)

The context pill and Context tab header use OpenCode Desktop's session store (`lastAssistantWithUsage`, model limits, `session.cost`) — the same source as the app header. The breakdown chart remains a local estimate from the server plugin. Provider tokens include **cache write** as well as cache read.

While a compaction message is `running`, the context pill shows **Compacting…** and the Context header shows auto/manual progress. When compaction completes or fails, the Context tab shows summary cost and token usage (2.3 background compaction).

The Jobs tab lists live `session.background` tasks and, when available, `experimental.job.list` history (including descendant jobs). Rows are typed as **shell**, **subagent**, **image**, or **codemode**. Shell rows that hit a timeout stay shown as running (2.3.1 keeps them alive). Click **Open** on a subagent row to focus that child session. Optional desktop notifications fire when a watched job leaves the running list, including sessions that are not focused, and name the job kind.

Hook log rows are limited to tools, forks, compaction, and shell start/end — the catch-all `event:*` stream is no longer stored so useful rows survive the 200-entry cap.

## Live store dashboard (0.7)

Info and Agents read the Desktop session store instead of polling the server overview/agents RPC. Git branch comes from `location.vcs`, MCP from `location.mcp.server`, children from `session.family`, and the goal from the first-party `opencode.goal` RPC (empty when that plugin is absent). The dead Todos row is gone.

The Context tab shows a **Provider allowance** card when `location.usage.limits` reports OpenCode Go meters or Console budgets. The card stays hidden when the workspace has no limits.

A **Waiting** composer pill appears for pending permissions, open forms, and inbox items whose pending status is `queued` or `stranded`. Opening it focuses the Info tab waiting list. Optional notifications use a separate `notifyWaiting` preference (on by default). Diagnostics copy includes the store snapshot (overview, agents, allowance, waiting, goal) plus the estimate and hooks.

## Resources

- [Plugin Documentation](https://opencode.ai/v2/docs/build/plugins)
- [SDK Reference](https://opencode.ai/v2/docs/sdk)
- [Community Plugins](https://opencode.ai/v2/docs/ecosystem/#plugins)
- [OpenCode Discord](https://opencode.ai/discord)

## License

MIT
