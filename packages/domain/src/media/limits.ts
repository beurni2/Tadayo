// A photo upload's limit and its rejections' codes on their own, for the worker's image process
// (services/worker/src/image-child.ts and image-process.ts), which reads them without loading the rest of the domain:
// the domain's modules alone add about 45 MiB to a process.

/** D09: a photo upload is at most 20 MiB. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Why the worker refused a photo: `upload.rejection`'s values (db/migrations/0006_contributions.sql), as the contract
 * has them.
 */
export const UPLOAD_REJECTIONS = ["unsupported_type", "too_large", "too_many_pixels", "unreadable"] as const;
export type UploadRejection = (typeof UPLOAD_REJECTIONS)[number];
