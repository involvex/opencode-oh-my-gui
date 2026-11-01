# OpenCode Plugin Development (V2)

This is an OpenCode V2 plugin. OpenCode is an AI-powered coding assistant that runs in the terminal.
V2 uses the `@opencode/plugin` package with the `Plugin.define({ id, setup(ctx) })` pattern.

## Documentation

- [Plugin Documentation](https://opencode.ai/v2/docs/build/plugins)
- [SDK Reference](https://opencode.ai/v2/docs/sdk)
- [Community Plugins](https://opencode.ai/v2/docs/ecosystem/#plugins)

## Project Structure

```
src/
  index.ts    # Plugin entry point - exports Plugin.define
dev.ts        # Development script - runs OpenCode with this plugin loaded
```

## Plugin Architecture (V2)

V2 plugins use `Plugin.define({ id, setup(ctx) })` — a declarative pattern where you
register hooks and tools programmatically inside `setup`:

```typescript
import { Plugin } from '@opencode/plugin'
import { Effect, Schema } from 'effect'

export default Plugin.define({
	id: '@involvex/oh-my-gui',
	setup(ctx) {
		// ctx provides domain services (see below)
		// Register hooks, tools, commands here

		return async () => {
			// optional cleanup
		}
	},
})
```

### Context Object (V2)

V2 replaces V1's `PluginInput` with a `Context` that exposes domain services:

| V1 `ctx` property         | V2 equivalent               | Description                                    |
| ------------------------- | --------------------------- | ---------------------------------------------- |
| `ctx.client`              | `ctx.app`                   | Server info `{ name, version, channel }`       |
| `ctx.project`             | `ctx.location.project`      | Current project info                           |
| `ctx.directory`           | `ctx.location.directory`    | Working directory                              |
| `ctx.worktree`            | N/A (VCS via `ctx.vcs`)     | Worktree/VCS access                            |
| `ctx.$`                   | N/A (use `Effect` in tools) | Shell execution                                |
| `ctx.client.app.log()`    | `console.log`               | Use process logging instead                    |
| `ctx.client.config.get()` | `ctx.options`               | Plugin options from config                     |
| N/A                       | `ctx.storage`               | `{ get, set, remove, scan }` — persisted state |
| N/A                       | `ctx.tool`                  | Tool management (`transform`, `list`, `hook`)  |
| N/A                       | `ctx.session`               | Session hooks                                  |
| N/A                       | `ctx.event`                 | `subscribe(callback)` — event subscription     |
| N/A                       | `ctx.permission`            | Permission hooks (`evaluate`)                  |
| N/A                       | `ctx.shell`                 | Shell hooks (`create.before`)                  |
| N/A                       | `ctx.command`               | Command management (`transform`)               |
| N/A                       | `ctx.agent`                 | Agent management                               |
| N/A                       | `ctx.model`                 | Model management                               |
| N/A                       | `ctx.mcp`                   | MCP server management                          |
| N/A                       | `ctx.provider`              | Provider management                            |

## Hook Registration (V2)

V2 hooks are registered **programmatically** via domain `.hook()` APIs, not returned
from the setup function as in V1. Each `.hook()` call returns a `Registration`
with a `.dispose()` method.

### Event Subscription

```typescript
ctx.event.subscribe(({ event }) => {
	if (event.type === 'session.idle') {
		console.log('Session completed')
	}
})
```

### Session Hooks (replaces V1 chat.* hooks)

| V1 Hook                                | V2 Hook                                 | Description                            |
| -------------------------------------- | --------------------------------------- | -------------------------------------- |
| `chat.message`                         | `ctx.session.hook('prompt', cb)`        | Intercept/modify user prompts          |
| `chat.params`                          | `ctx.session.hook('context', cb)`       | Modify LLM options (temperature, etc.) |
| `chat.system.transform`                | `ctx.session.hook('context', cb)`       | Modify system prompt                   |
| `experimental.chat.messages.transform` | `ctx.session.hook('context', cb)`       | Modify conversation messages           |
| `experimental.session.compacting`      | `ctx.session.hook('compaction', cb)`    | Customize session compaction           |
| `chat.headers`                         | `ctx.session.hook('model.request', cb)` | Add headers to LLM requests            |
| `permission.ask`                       | `ctx.permission.hook('evaluate', cb)`   | Auto-allow/deny permissions            |
| `event`                                | `ctx.event.subscribe(cb)`               | Subscribe to OpenCode events           |

### Tool Hooks

| V1 Hook               | V2 Hook                               | Description                            |
| --------------------- | ------------------------------------- | -------------------------------------- |
| `tool.execute.before` | `ctx.tool.hook('execute.before', cb)` | Before tool execution (throw to block) |
| `tool.execute.after`  | `ctx.tool.hook('execute.after', cb)`  | After tool execution                   |

### Shell Hooks

| V1 Hook     | V2 Hook                               | Description                     |
| ----------- | ------------------------------------- | ------------------------------- |
| `shell.env` | `ctx.shell.hook('create.before', cb)` | Inject env vars, modify command |

### Hooks Without V2 Equivalents

These V1 hooks have no direct V2 equivalent:

| V1 Hook                      | V2 Status                                      |
| ---------------------------- | ---------------------------------------------- |
| `config`                     | Use `ctx.options` instead (read plugin config) |
| `command.execute.before`     | Commands managed via `ctx.command.transform()` |
| `experimental.text.complete` | No V2 equivalent                               |

## Custom Tools (V2)

V2 tools use Effect's `Schema` for input/output validation (not V1's `tool.schema.string()`).

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
				input: Schema.Struct({ foo: Schema.String }),
				execute: ({ foo }) => {
					return Effect.succeed({
						content: [{ type: 'text' as const, text: `Result: ${foo}` }],
					})
				},
			})
		})
	},
})
```

## V1 → V2 Hook Migration Guide

### Blocking Tool Execution

V1:

```typescript
'tool.execute.before': async (input, output) => {
	if (input.tool === 'read' && output.args.filePath.includes('.env')) {
		throw new Error('Cannot read .env files')
	}
}
```

V2:

```typescript
ctx.tool.hook('execute.before', ({ tool, input }) => {
	if (tool === 'read' && String(input).includes('.env')) {
		throw new Error('Cannot read .env files')
	}
})
```

### Auto-Approve Permissions

V1:

```typescript
'permission.ask': async (input, output) => {
	if (input.tool === 'read') {
		output.status = 'allow'
	}
}
```

V2:

```typescript
ctx.permission.hook('evaluate', ({ action, resources, effect }) => {
	if (action === 'read' && resources.every((r) => !r.includes('.env'))) {
		effect = 'allow'
	}
})
```

### Send Notifications on Session Complete

V1:

```typescript
event: async ({ event }) => {
	if (event.type === 'session.idle') {
		await ctx.$`osascript -e 'display notification "Done!" with title "OpenCode"'`
	}
}
```

V2:

```typescript
ctx.event.subscribe(({ event }) => {
	if (event.type === 'session.idle') {
		console.log('[@involvex/oh-my-gui] session completed')
	}
})
```

### Inject Environment Variables

V1:

```typescript
'shell.env': async (input, output) => {
	output.env.MY_API_KEY = process.env.MY_API_KEY || ''
}
```

V2:

```typescript
ctx.shell.hook('create.before', ({ env }) => {
	env.MY_API_KEY = process.env.MY_API_KEY || ''
})
```

### Modify LLM Temperature

V1:

```typescript
'chat.params': async (input, output) => {
	output.temperature = 0.7
}
```

V2:

```typescript
ctx.session.hook('context', ({ options }) => {
	options.temperature = 0.7
})
```

## Development Workflow

1. Edit `src/index.ts` to implement your plugin logic
2. Run `bun dev` to start OpenCode with your plugin loaded
3. Test your plugin by interacting with OpenCode
4. Run `bun typecheck` to verify types

## Logging

Use `console.log` for logging (V2 no longer provides `ctx.client.app.log`):

```typescript
console.log('[@involvex/oh-my-gui] Something happened')
```

## Storage

Use `ctx.storage` for persisted key-value state:

```typescript
// In setup:
const value = await ctx.storage.get('my-key')
await ctx.storage.set('my-key', { foo: 'bar' })
await ctx.storage.remove('my-key')
```

## Publishing

1. Update `package.json` with your plugin name, description, and repository
2. Run `npm publish`
3. Users install by adding to their `opencode.json` (V2 config format):

```jsonc
{
	"plugins": [{ "package": "@involvex/oh-my-gui@latest" }],
}
```
