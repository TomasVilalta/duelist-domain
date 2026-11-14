export * from './cards'

export type Seat = number;

export type ClientMessage = { type: "ping" };

export type ServerMessage = { type: "pong"; at: number };
