export * from './cards'
export * from './seat'
export * from './state'

export type ClientMessage = { type: "ping" };

export type ServerMessage = { type: "pong"; at: number };
