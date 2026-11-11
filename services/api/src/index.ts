// The API as a library, for the tests: importing it starts nothing (the entry is main.ts).
export { buildApp, notFound, routesOf, type Deps } from "./app.ts";
export { connect, type ApiSql } from "./connection.ts";
export { startApi, type Started } from "./start.ts";
