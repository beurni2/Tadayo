// The API as a library, for the tests: importing it starts nothing (the entry is main.ts).
export { buildApp, notFound, routesOf, type Deps } from "./app.ts";
export { connect, type ApiSql } from "./connection.ts";
export {
  KeysUnavailable,
  supabaseProject,
  supabaseVerifier,
  verifierFor,
  type KeySet,
  type Verifier,
} from "./identity/token.ts";
export { meBody } from "./identity/me.ts";
export { type LogConfig } from "./logging.ts";
export { bearerToken, sessions, type Authenticate } from "./session.ts";
export { startApi, type Started } from "./start.ts";
