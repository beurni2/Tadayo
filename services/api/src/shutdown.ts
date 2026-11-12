// How the API stops (docs/plans/api-b0-deploy.md, section 3). Fly stops a Machine with a signal
// (SIGTERM from a deploy, SIGINT from `fly machine stop`'s default), and kills it after
// `kill_timeout` (fly.toml: 30 seconds). On the first signal the API stops listening, lets the
// requests in flight finish, ends its database connection (giving queries still running
// `END_SECONDS`, after which postgres.js closes it anyway: the app's own `onClose` hook does it as
// it closes, app.ts, and this asks again in case the close failed first) and resolves, and main.ts
// then ends the process, with exit code 0 when all went well, so that nothing left open (a socket
// postgres.js half-closed) holds it past `kill_timeout`. A second signal isn't caught, so it ends
// the process as signals do.
//
// Closing Fastify waits for every connection to end, and a connection a request has finished on
// stays open for the keep-alive time (Fastify's default is 72 seconds, longer than Fly waits), so a
// stop with one request in flight would be killed instead of finishing. While it waits, the
// connections left idle are ended as they come, and the ones still in use when the grace is over are
// ended too: a request that outlasts the grace is cut, once, with a line that says so.
//
// A known limit (docs/LIMITATIONS.md): Node's closeIdleConnections() destroys a connection as soon as
// its response is finished, which is when the last write has been handed to the socket and not when
// the reader has received it, so a large answer still in the socket's buffer for a slow reader is cut
// by a stop. The answers B0 sends are small. The media route (B3) streams files, so it revisits this.

/** The two signals a stop waits for, as the process's own `once` and `off` take them. */
export interface SignalEvents {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  off(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

/** What a stop needs of the app: to close, and to end the connections that close waits for. */
export interface StoppableApp {
  close(): Promise<unknown>;
  readonly server: {
    closeIdleConnections(): void;
    closeAllConnections(): void;
  };
}

/** How often the connections left idle are ended while the app closes (milliseconds). */
export const SWEEP_MS = 250;
/**
 * How long the requests in flight have to finish (milliseconds): `kill_timeout` in fly.toml is 30
 * seconds, and what follows the grace, ending the database's connection, needs the rest.
 */
export const GRACE_MS = 25_000;
/**
 * How long ending the database's connection waits for queries still running (seconds, as postgres.js's
 * `end({ timeout })` takes it): a request cut at the grace may leave its query running, and the end
 * mustn't outlast `kill_timeout`.
 */
export const END_SECONDS = 3;

/** What a stop needs of the server, the database connection and the process. */
export interface StopOptions {
  readonly app: StoppableApp;
  readonly sql: { end(options: { timeout: number }): Promise<unknown> };
  /** Writes a line to the log; the caller adds nothing to it but its newline. */
  readonly say: (line: string) => void;
  /** Called with a message, which holds none of the error's own words (T52, T56), when closing fails. */
  readonly fail: (message: string) => void;
  /** Where the signals come from: the process. */
  readonly events?: SignalEvents;
  /** How often idle connections are ended while closing: `SWEEP_MS`. */
  readonly sweepMs?: number;
  /** How long requests in flight have before their connections are ended: `GRACE_MS`. */
  readonly graceMs?: number;
}

/**
 * Waits for the first SIGTERM or SIGINT, then stops. The promise it returns resolves when the stop
 * has finished, and never rejects; if no signal comes it never resolves.
 */
export function stopOnSignal(options: StopOptions): Promise<void> {
  const events = options.events ?? process;
  const sweepMs = options.sweepMs ?? SWEEP_MS;
  const graceMs = options.graceMs ?? GRACE_MS;
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
      const { app } = options;
      const sweep = setInterval(() => {
        app.server.closeIdleConnections();
      }, sweepMs);
      let grace: NodeJS.Timeout | undefined;
      try {
        const closing = app.close();
        const overdue = new Promise<"overdue">((resolve) => {
          grace = setTimeout(() => {
            resolve("overdue");
          }, graceMs);
        });
        if ((await Promise.race([closing.then(() => "closed" as const), overdue])) === "overdue") {
          options.say(`api: requests still running after ${String(graceMs / 1000)} seconds are ended`);
          app.server.closeAllConnections();
          await closing;
        }
      } catch {
        clean = false;
        options.fail("api: the server didn't close cleanly");
      } finally {
        clearInterval(sweep);
        clearTimeout(grace);
      }
      try {
        await options.sql.end({ timeout: END_SECONDS });
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
