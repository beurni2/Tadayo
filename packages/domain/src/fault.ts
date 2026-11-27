// The errors the server's own code throws, each with a site code (the outside audit's B7). A line about a failure
// carries an error's class and code and never its message, which can quote a row or a value (T52): the API's 500
// (services/api/src/logging.ts `safeError`), the worker's lines (`describeFailure`) and an outbox event's
// `last_error` (`failureCode`). A plain `Error` of ours carried no code, so all such a line said was "Error". Each
// error the code makes is one of these three instead, with a code that names its site: its file's name and its place
// among that file's sites when it was written (`home_3`), `api_` or `worker_` in front for a file of those services.
// The code is a literal at its site, so one search from a log's code finds the line, and it stays the same when the
// file moves or gains a site. A function that makes one fault for many checks (a parser's `shape()`) has one code,
// which names the parser, not the check. `fault.test.ts` holds every site of the three folders to it.

/**
 * A site code: lower-case letters, digits and `_`, from a letter, ending in `_` and a number, at most 32 characters.
 * It fits the patterns the worker's lines and 0009's `last_error` check read, can't hold a URL or a message, and its
 * number keeps it apart from the worker's reason codes (`storage.unavailable`, `payload`). Written out at its site
 * (`fault.test.ts`), it holds nothing a request or a row could put there.
 */
export const SITE_CODE = /^[a-z][a-z0-9_]*_[0-9]+$/;

function siteCode(code: string): string {
  if (code.length > 32 || !SITE_CODE.test(code)) {
    // The one error made here without a code of its own: a site code that isn't one is a mistake in the code itself.
    throw new TypeError("fault: a site code is lower-case letters, digits and _, ending in _ and a number, 32 at most");
  }
  return code;
}

/** A failure of the code's own: a row in a shape it doesn't know, a rule broken under a lock, a setting missing. */
export class Fault extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "Fault";
    this.code = siteCode(code);
  }
}

/** An argument a function refuses, as its `TypeError`. */
export class InputFault extends TypeError {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InputFault";
    this.code = siteCode(code);
  }
}

/** A number or a date outside what a function takes, as its `RangeError`. */
export class RangeFault extends RangeError {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RangeFault";
    this.code = siteCode(code);
  }
}
