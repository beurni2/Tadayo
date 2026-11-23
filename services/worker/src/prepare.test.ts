// The line a preparation writes, for spike S2's times (docs/plans/api-b2-spike-prepare.md section 6; T52): the
// upload's opaque id, the outcome, each step's milliseconds and the peak memory, and nothing else; and the scoped
// content hash (T21). The handler itself runs against Postgres in tests/src/db/worker-prepare.test.ts.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHash, preparedLine } from "./prepare.ts";
import { testImage } from "./testing.ts";

const MiB = 1024 * 1024;

describe("a preparation's line", () => {
  it("says the upload's id, the times of each step, the outcome, and the peak memory of the worker and of the photo's process", () => {
    expect(
      preparedLine(
        {
          upload: "upl_abc",
          outcome: "ready",
          ms: { total: 912, read: 120, image: 640, store: 130, record: 22 },
          photoPeakBytes: 141.6 * MiB,
        },
        103.4 * MiB,
      ),
    ).toBe(
      "worker: prepared an upload upl_abc in 912 ms (read 120, image 640, store 130, record 22), ready, " +
        "peak memory: worker 103 MiB, photo 142 MiB",
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
      "worker: prepared an upload upl_abc in 40 ms (read 30, image 5, store 0, record 5), rejected too_many_pixels, " +
        "peak memory: worker 90 MiB, photo 0 MiB",
    );
  });
});

describe("the scoped content hash (T21)", () => {
  it("is the same for one owner's same bytes, and different for another owner or other bytes", async () => {
    const bytes = await testImage(32, 32);
    const other = await testImage(32, 33);
    const a = contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes);
    expect(a).toHaveLength(32);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes).equals(a)).toBe(true);
    expect(contentHash("acct_bbbbbbbbbbbbbbbbbbbbbb", bytes).equals(a)).toBe(false);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", other).equals(a)).toBe(false);
  });

  it("is never a plain hash of the bytes, which anyone holding the photo could compute", async () => {
    const bytes = await testImage(32, 32);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes).equals(createHash("sha256").update(bytes).digest())).toBe(
      false,
    );
  });
});
