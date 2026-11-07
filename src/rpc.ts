// src/rpc.ts
//
// RPC contract between the server part and the Desktop GUI part.
// The server registers it in src/index.ts; the GUI calls it via ctx.client.rpc().

import { Rpc } from '@opencode/plugin/rpc'

const OVERVIEW_PROPERTIES = {
	sessionID: { type: 'string' },
	parentID: { type: 'string' },
	agent: { type: 'string' },
	modelID: { type: 'string' },
	providerID: { type: 'string' },
	directory: { type: 'string' },
	gitBranch: { type: 'string' },
	mcp: { type: 'array', items: { type: 'string' } },
	todos: { type: 'number' },
	updatedAt: { type: 'string' },
}

const AGENT_PROPERTIES = {
	id: { type: 'string' },
	name: { type: 'string' },
	description: { type: 'string' },
	mode: { type: 'string' },
	modelID: { type: 'string' },
	providerID: { type: 'string' },
	active: { type: 'boolean' },
	tools: { type: 'array', items: { type: 'string' } },
}

const CONTEXT_ROW_PROPERTIES = {
	sessionID: { type: 'string' },
	parentID: { type: 'string' },
	agent: { type: 'string' },
	modelID: { type: 'string' },
	ctx: { type: 'number' },
	input: { type: 'number' },
	usable: { type: 'number' },
	reserve: { type: 'number' },
	user: { type: 'number' },
	assistant: { type: 'number' },
	reasoning: { type: 'number' },
	toolArgs: { type: 'number' },
	toolOut: { type: 'number' },
	system: { type: 'number' },
	toolSchemas: { type: 'number' },
	other: { type: 'number' },
	source: { type: 'string' },
	updatedAt: { type: 'string' },
	stale: { type: 'boolean' },
}

const HOOK_ENTRY_PROPERTIES = {
	ts: { type: 'string' },
	type: { type: 'string' },
	tool: { type: 'string' },
	status: { type: 'string' },
	summary: { type: 'string' },
	detail: { type: 'string' },
	sessionID: { type: 'string' },
}

export const DashboardRpc = Rpc.define({
	id: 'oh-my-gui',
	methods: {
		overview: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					data: { type: 'object', properties: OVERVIEW_PROPERTIES, additionalProperties: false },
				},
				required: ['sessionID', 'data'],
				additionalProperties: false,
			},
		},
		agents: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					agents: {
						type: 'array',
						items: {
							type: 'object',
							properties: AGENT_PROPERTIES,
							required: Object.keys(AGENT_PROPERTIES),
							additionalProperties: false,
						},
					},
				},
				required: ['sessionID', 'agents'],
				additionalProperties: false,
			},
		},
		context: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					rows: {
						type: 'array',
						items: {
							type: 'object',
							properties: CONTEXT_ROW_PROPERTIES,
							required: Object.keys(CONTEXT_ROW_PROPERTIES),
							additionalProperties: false,
						},
					},
				},
				required: ['sessionID', 'rows'],
				additionalProperties: false,
			},
		},
		hooks: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' }, limit: { type: 'number' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					entries: {
						type: 'array',
						items: {
							type: 'object',
							properties: HOOK_ENTRY_PROPERTIES,
							required: Object.keys(HOOK_ENTRY_PROPERTIES),
							additionalProperties: false,
						},
					},
				},
				required: ['sessionID', 'entries'],
				additionalProperties: false,
			},
		},
		clearHooks: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: { ok: { type: 'boolean' } },
				required: ['ok'],
				additionalProperties: false,
			},
		},
		health: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					data: {
						type: 'object',
						properties: {
							updatedAt: { type: 'string' },
							lastHookAt: { type: 'string' },
							hookCount: { type: 'number' },
							hookErrors: { type: 'number' },
							toolCalls: { type: 'number' },
							promptTokensEst: { type: 'number' },
							outputTokensEst: { type: 'number' },
							totalTokens: { type: 'number' },
							usable: { type: 'number' },
							reserve: { type: 'number' },
							compactionRisk: { type: 'string' },
							source: { type: 'string' },
						},
						required: [
							'updatedAt',
							'lastHookAt',
							'hookCount',
							'hookErrors',
							'toolCalls',
							'promptTokensEst',
							'outputTokensEst',
							'totalTokens',
							'usable',
							'reserve',
							'compactionRisk',
							'source',
						],
						additionalProperties: false,
					},
				},
				required: ['sessionID', 'data'],
				additionalProperties: false,
			},
		},
	},
	events: {},
})

export const DASHBOARD_OVERVIEW_KEYS = Object.keys(OVERVIEW_PROPERTIES)
export const DASHBOARD_AGENT_KEYS = Object.keys(AGENT_PROPERTIES)
export const DASHBOARD_CONTEXT_ROW_KEYS = Object.keys(CONTEXT_ROW_PROPERTIES)
export const DASHBOARD_HOOK_ENTRY_KEYS = Object.keys(HOOK_ENTRY_PROPERTIES)
