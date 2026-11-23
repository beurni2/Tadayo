// A photo upload's limit on its own, for the worker's image process (services/worker/src/image-child.ts), which reads
// it without loading the rest of the domain: the domain's modules alone add about 45 MiB to a process.

/** D09: a photo upload is at most 20 MiB. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
