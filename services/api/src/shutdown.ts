// How the API stops (docs/plans/api-b0-deploy.md, section 3). Fly stops a Machine with a signal
// (SIGTERM from a deploy, SIGINT from `fly machine stop`'s default), and kills it after
// `kill_timeout`. On the first signal the API stops listening, lets the requests in flight finish,
// ends its database connection and lets the process end with exit code 0, so a deploy cuts no
// request short. A second signal isn't caught, so it ends the process as signals do.

/** The two signals a stop waits for, as the process's own `once` and `off` take them. */
export interface SignalEvents {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  off(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

/** What a stop needs of the server, the database connection and the process. */
export interface StopOptions {
  readonly app: { close(): Promise<unknown> };
  readonly sql: { end(): Promise<unknown> };
  /** Writes a line to the log; the caller adds nothing to it but its newline. */
  readonly say: (line: string) => void;
  /** Called with a message, which holds none of the error's own words (T52, T56), when closing fails. */
  readonly fail: (message: string) => void;
  /** Where the signals come from: the process. */
  readonly events?: SignalEvents;
}

/**
 * Waits for the first SIGTERM or SIGINT, then stops. The promise it returns resolves when the stop
 * has finished, and never rejects; if no signal comes it never resolves.
 */
export function stopOnSignal(options: StopOptions): Promise<void> {
  const events = options.events ?? process;
  return new Promise((resolve) => {
    const handlers = {
      SIGTERM: () => {
        void stop("SIGTERM");
      },
      SIGINT: () => {
        void stop("SIGINT");
      },
    } as const;
    async function stop(signal: string): Promise<void> {
      // Both let go, so that a second signal gets the default action.
      events.off("SIGTERM", handlers.SIGTERM);
      events.off("SIGINT", handlers.SIGINT);
      options.say(`api: stopping on ${signal}`);
      let clean = true;
      try {
        await options.app.close();
      } catch {
        clean = false;
        options.fail("api: the server didn't close cleanly");
      }
      try {
        await options.sql.end();
      } catch {
        clean = false;
        options.fail("api: the database's connection didn't end cleanly");
      }
      if (clean) options.say("api: stopped");
      resolve();
    }
    events.once("SIGTERM", handlers.SIGTERM);
    events.once("SIGINT", handlers.SIGINT);
  });
}
