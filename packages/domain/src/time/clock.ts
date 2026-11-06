/// <reference lib="esnext.temporal" />
// The server's clock (T1, T3; ADR-013; TECH-DESIGN section 5). Nothing else reads the time.
//
// A command samples it in its own transaction after taking its locks, so a commit that waited for
// the occurrence's lock across 07:00 reads the time after the wait (T3): Postgres's
// `clock_timestamp()`, the moment of the query, never `now()`, which is the transaction's start.
// The sample comes back as whole epoch microseconds, Postgres's own precision, so it is exact.
//
// `dev` adds the offset in `app.dev_clock`, so a gate can show the 7 AM reveal, the 1 AM close
// and a cutoff race on demand. That table exists only on `dev` (tools/ops/sql/dev_clock.sql,
// outside the numbered migrations, which run everywhere), and its offset only grows: its triggers
// refuse any change to its row that would move it back. `prod`'s clock
// has no offset in its query at all, and refuses to start on a database that has the table, so a
// dev clock can't reveal anything in `prod`.
//
// Every sample is taken under READ COMMITTED, the commands' isolation (TECH-DESIGN section 5: row
// locks, in a fixed order). The dev clock reads its offset in the sample's own statement, so there
// it sees the offset as it is after the locks. Under REPEATABLE READ or SERIALIZABLE it would see
// the offset as it was at the transaction's first statement, before a lock wait, and could put a
// commit on the wrong side of 07:00 while a gate moves the clock. Both clocks refuse to sample
// there, and so does the tests' fake clock (./testing.ts, outside the package's main entry), so a
// command whose tests run against Postgres with any of the three fails in ci, not only on dev.
//
// The samples' SQL names every operator and type in pg_catalog: `extract` gives a numeric, and
// pg_catalog has no `*` for a numeric and an integer, so an exact one in a schema on the search
// path would otherwise win and move the clock.

/** One query in the caller's transaction, as postgres.js runs a tagged template. */
export type ClockSql = (
  template: TemplateStringsArray,
  ...values: readonly never[]
) => PromiseLike<readonly Record<string, unknown>[]>;

export interface Clock {
  /** The server's time now, read in `tx` after its locks, under READ COMMITTED (T1, T3). */
  sample(tx: ClockSql): Promise<Temporal.Instant>;
}

/** Throws unless `isolation`, as Postgres's `transaction_isolation` names it, is READ COMMITTED. */
export function requireReadCommitted(isolation: unknown): void {
  if (isolation !== "read committed") {
    throw new Error(
      `time: the clock is sampled under READ COMMITTED, so dev's offset is read after the locks, not ${String(isolation)}`,
    );
  }
}

function sampled(rows: readonly Record<string, unknown>[]): Temporal.Instant {
  requireReadCommitted(rows[0]?.["isolation"]);
  const answer = rows[0]?.["now_us"];
  if (typeof answer !== "string" || !/^-?[0-9]{1,19}$/.test(answer)) {
    throw new Error(`time: the clock answered ${String(answer)}, not a whole number of microseconds`);
  }
  return Temporal.Instant.fromEpochNanoseconds(BigInt(answer) * 1000n);
}

const PROD_CLOCK: Clock = {
  async sample(tx) {
    return sampled(
      await tx`
        SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)
                 ::pg_catalog.int8::pg_catalog.text AS now_us,
               pg_catalog.current_setting('transaction_isolation') AS isolation`,
    );
  },
};

const DEV_CLOCK: Clock = {
  async sample(tx) {
    return sampled(
      await tx`
        SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8
                OPERATOR(pg_catalog.+) coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))
                 ::pg_catalog.text AS now_us,
               pg_catalog.current_setting('transaction_isolation') AS isolation`,
    );
  },
};

/**
 * The clock of the environment the API or the worker runs in, `dev` or `prod`, once, at startup.
 * `prod` refuses a database that has a dev clock; `dev` refuses one that hasn't, or whose table
 * isn't as tools/ops/sql/dev_clock.sql makes it, or that its role can't read. Any other value is
 * refused, so a typo in the configuration, or a missing one, can't pick `dev`: the caller passes
 * the configuration's value as it is. The checks guard against mistakes made on `dev`, such as a
 * trigger disabled or the table made by another role. They don't read the trigger function's
 * body, and the table's owner can still change the table by hand after startup, which
 * `tools/ops`' `dev-clock` never does.
 */
export async function prepareClock(environment: string, sql: ClockSql): Promise<Clock> {
  if (environment !== "dev" && environment !== "prod") {
    throw new Error(`time: the environment is ${JSON.stringify(environment)}, not dev or prod (ADR-013)`);
  }
  // From the catalog, so neither the search path nor a privilege can hide the table.
  const rows = await sql`SELECT EXISTS (SELECT FROM pg_catalog.pg_class c
                                          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                                         WHERE n.nspname = 'app' AND c.relname = 'dev_clock') AS present`;
  const present = rows[0]?.["present"];
  if (typeof present !== "boolean") throw new Error("time: the dev clock's check got no answer");
  if (environment === "prod") {
    if (present) throw new Error("time: prod refuses a dev clock, and this database has app.dev_clock (ADR-013)");
    return PROD_CLOCK;
  }
  if (!present)
    throw new Error("time: dev's clock reads app.dev_clock, which tools/ops/sql/dev_clock.sql makes (ADR-013)");
  // As the file makes it: a table, not a view, owned by this role, so row-level security doesn't
  // hide its row; row-level security on (T53), and not forced on the owner, which would hide it
  // too; and the three triggers that keep it moving forward enabled. Then read once, so a privilege
  // taken away stops dev now rather than at a request.
  const shape = await sql`
    SELECT c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity
           AND c.relowner = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user)
           AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger t
                 WHERE t.tgrelid = c.oid AND t.tgenabled IN ('O', 'A')
                   AND t.tgname IN ('dev_clock_forward', 'dev_clock_kept', 'dev_clock_no_truncate'))
               = 3::pg_catalog.int8 AS sound
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relname = 'dev_clock'`;
  if (shape[0]?.["sound"] !== true) {
    throw new Error(
      "time: dev's clock needs app.dev_clock as tools/ops/sql/dev_clock.sql makes it: a table this role owns, " +
        "row-level security on and not forced, its three triggers enabled (ADR-013, T53)",
    );
  }
  try {
    await sql`SELECT offset_microseconds FROM app.dev_clock`;
  } catch (error) {
    throw new Error("time: dev's clock can't read app.dev_clock, which tadayo_app owns (ADR-013, T53)", {
      cause: error,
    });
  }
  return DEV_CLOCK;
}
