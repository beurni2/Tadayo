// The `ops` scripts' connection to the database (docs/plans/api-b0-deploy.md, section 4; T52, T56).
// The driver is given the parts the guard checked (`databaseOf`, which `psql` is given too), not
// the string: postgres.js reads a string its own way (it takes the host after the first `@`, takes a
// missing port from `PGPORT`, and reads `?host=`-style parameters), so a string the guard accepted
// could still send the driver somewhere else. With every part named, nothing in the environment
// or in the string picks a host or a port.
//
// TLS is required, as Supabase's session pooler asks. `require` means encrypted, not authenticated:
// postgres.js then accepts any certificate (docs/LIMITATIONS.md says what checking it needs).

import type postgres from "postgres";
import { databaseOf, type DevDatabaseUrl } from "./environment.ts";
import { noticeLine } from "./output.ts";

/**
 * postgres.js's options for a database `devDatabaseUrl` has let through. Postgres's warnings go to
 * `write`, through `redact`, and its routine notices go nowhere.
 */
export function connectionOptions(
  url: DevDatabaseUrl,
  redact: (line: string) => string,
  write: (line: string) => void,
): postgres.Options<Record<string, never>> {
  const { host, port, user, password, database } = databaseOf(url);
  return {
    host,
    port,
    username: user,
    password,
    database,
    max: 1,
    ssl: "require",
    connect_timeout: 20,
    onnotice: (notice) => {
      const line = noticeLine(notice);
      if (line !== undefined) write(redact(line));
    },
  };
}
