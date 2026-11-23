// Portable contract for the first-party opencode.goal plugin RPC.
import { Rpc } from '@opencode/plugin/rpc'

const GOAL_PROPERTIES = {
	id: { type: 'string' },
	objective: { type: 'string' },
	status: { type: 'string' },
	reason: { type: 'string' },
	rounds: { type: 'number' },
	maxRounds: { type: 'number' },
	stalls: { type: 'number' },
	boot: { type: 'string' },
	updatedAt: { type: 'number' },
}

export const GoalRpc = Rpc.define({
	id: 'opencode.goal',
	methods: {
		get: {
			input: {
				type: 'object',
				properties: { sessionID: { type: 'string' } },
				required: ['sessionID'],
				additionalProperties: false,
			},
			output: {
				anyOf: [
					{ type: 'null' },
					{
						type: 'object',
						properties: GOAL_PROPERTIES,
						required: ['id', 'objective', 'status', 'rounds', 'maxRounds', 'boot', 'updatedAt'],
						additionalProperties: true,
					},
				],
			},
		},
	},
	events: {
		changed: {
			schema: {
				type: 'object',
				properties: {
					sessionID: { type: 'string' },
					goal: {
						anyOf: [
							{ type: 'null' },
							{
								type: 'object',
								properties: GOAL_PROPERTIES,
								additionalProperties: true,
							},
						],
					},
				},
				required: ['sessionID', 'goal'],
				additionalProperties: true,
			},
		},
	},
})

export type GoalState = {
	id: string
	objective: string
	status: 'active' | 'paused' | 'complete' | string
	reason?: string
	rounds: number
	maxRounds: number
	stalls?: number
	boot: string
	updatedAt: number
}
