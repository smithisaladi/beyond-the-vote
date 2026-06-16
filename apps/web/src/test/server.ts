import { setupServer } from "msw/node";

// Per-test handlers are registered with server.use(...); the base server
// starts with none so an unhandled request throws (see setup.ts).
export const server = setupServer();
