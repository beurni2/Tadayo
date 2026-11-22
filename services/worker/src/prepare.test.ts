// The line a preparation writes, for spike S2's times (docs/plans/api-b2-spike-prepare.md section 6; T52): the
// upload's opaque id, the outcome, each step's milliseconds and the peak memory, and nothing else. The handler
// itself runs against Postgres in tests/src/db/worker-prepare.test.ts.

import { describe, expect, it } from "vitest";
import { preparedLine } from "./prepare.ts";

const MiB = 1024 * 1024;

describe("a preparation's line", () => {
  it("says the upload's id, the times of each step, the outcome and the peak memory", () => {
    expect(
      preparedLine(
        { upload: "upl_abc", outcome: "ready", ms: { total: 912, read: 120, image: 640, store: 130, record: 22 } },
        183.4 * MiB,
      ),
    ).toBe(
      "worker: prepared an upload upl_abc in 912 ms (read 120, image 640, store 130, record 22), ready, peak memory 183 MiB",
    );
  });

  it("names a rejection by its code", () => {
    expect(
      preparedLine(
        {
          upload: "upl_abc",
          outcome: "rejected",
          rejection: "too_many_pixels",
          ms: { total: 40, read: 30, image: 5, store: 0, record: 5 },
        },
        90 * MiB,
      ),
    ).toBe(
      "worker: prepared an upload upl_abc in 40 ms (read 30, image 5, store 0, record 5), rejected too_many_pixels, peak memory 90 MiB",
    );
  });
});
