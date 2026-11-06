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
// outside the numbered migrations, which run everywhere), and its offset only grows. `prod`'s clock
// has no offset in its query at all, and refuses to start on a database that has the table, so a
// dev clock can't reveal anything in `prod`.
//
// Every sample is taken under READ COMMITTED, the commands' isolation (TECH-DESIGN section 5: row
// locks, in a fixed order). The dev clock reads its offset in the sample's own statement, so there
// it sees the offset as it is after the locks. Under REPEATABLE READ or SERIALIZABLE it would see
// the offset as it was at the transaction's first statement, before a lock wait, and could put a
// commit on the wrong side of 07:00 while a gate moves the clock. Both clocks refuse to sample
// there, so a caller that breaks the rule fails in ci, against prod's clock, and not only on dev.
// The tests' fake clock is in ./testing.ts, outside the package's main entry.

/** One query in the caller's transaction, as postgres.js runs a tagged template. */
export type ClockSql = (
  template: TemplateStringsArray,
  ...values: readonly never[]
) => PromiseLike<readonly Record<string, unknown>[]>;

export interface Clock {
  /** The server's time now, read in `tx` after its locks, under READ COMMITTED (T1, T3). */
  sample(tx: ClockSql): Promise<Temporal.Instant>;
}

function sampled(rows: readonly Record<string, unknown>[]): Temporal.Instant {
  const isolation = rows[0]?.["isolation"];
  if (isolation !== "read committed") {
    throw new Error(
      `time: the clock is sampled under READ COMMITTED, so dev's offset is read after the locks, not ${String(isolation)}`,
    );
  }
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
        SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,
               pg_catalog.current_setting('transaction_isolation') AS isolation`,
    );
  },
};

const DEV_CLOCK: Clock = {
  async sample(tx) {
    return sampled(
      await tx`
        SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint
                + coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))::text AS now_us,
               pg_catalog.current_setting('transaction_isolation') AS isolation`,
    );
  },
};

/**
 * The clock of the environment the API or the worker runs in, `dev` or `prod`, once, at startup.
 * `prod` refuses a database that has a dev clock; `dev` refuses one that hasn't, or whose table
 * its role can't read. Any other value is refused, so a typo in the configuration, or a missing
 * one, can't pick `dev`: the caller passes the configuration's value as it is.
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
  // The catalog shows the table whoever owns it; reading it once shows this role can, so a table
  // made by the wrong role stops dev at startup rather than at its first request.
  try {
    await sql`SELECT offset_microseconds FROM app.dev_clock`;
  } catch (error) {
    throw new Error("time: dev's clock can't read app.dev_clock, which tadayo_app owns (ADR-013, T53)", {
      cause: error,
    });
  }
  return DEV_CLOCK;
}
