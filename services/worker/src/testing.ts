// A Storage for the tests, in memory (the worker's own tests, tests/src/db and the privacy matrix): the originals
// the app put, by object key, and the renditions the worker put, by key. It can be made to fail, all at once or at
// one call, to stand in for Storage away. And the images those tests prepare, made here by `sharp`, so no
// photograph is committed and nothing in one names anybody.

import sharp from "sharp";
import { StorageUnavailable, type WorkerStorage } from "./storage.ts";

export interface FakeWorkerStorage extends WorkerStorage {
  /** The originals, as the app's PUT left them. */
  readonly originals: Map<string, Uint8Array>;
  /** The renditions the worker put, by key, the last put of each. */
  readonly renditions: Map<string, Uint8Array>;
  /** Every read, in order, by key. */
  readonly reads: string[];
  /** Every put, in order, by key: a key put twice is there twice. */
  readonly puts: string[];
  /** Every call fails while on. */
  failing(on: boolean): void;
  /** The next `count` rendition puts fail, then they work again. */
  failPuts(count: number): void;
}

export function fakeWorkerStorage(): FakeWorkerStorage {
  const originals = new Map<string, Uint8Array>();
  const renditions = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const puts: string[] = [];
  let down = false;
  let putsToFail = 0;
  return {
    originals,
    renditions,
    reads,
    puts,
    failing(on) {
      down = on;
    },
    failPuts(count) {
      putsToFail = count;
    },
    readOriginal(objectKey) {
      reads.push(objectKey);
      if (down) return Promise.reject(new StorageUnavailable("reading an original got no answer"));
      return Promise.resolve(originals.get(objectKey) ?? null);
    },
    putRendition(key, bytes) {
      if (down) return Promise.reject(new StorageUnavailable("putting a rendition got no answer"));
      if (putsToFail > 0) {
        putsToFail -= 1;
        return Promise.reject(new StorageUnavailable("putting a rendition answered 503"));
      }
      puts.push(key);
      renditions.set(key, bytes);
      return Promise.resolve();
    },
  };
}

/** A flat image of `width` by `height`, in `format`, for a test to prepare. */
export function testImage(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: "#4a7a5c" }, limitInputPixels: false });
  return format === "png"
    ? image.png().toBuffer()
    : format === "webp"
      ? image.webp().toBuffer()
      : image.jpeg().toBuffer();
}
