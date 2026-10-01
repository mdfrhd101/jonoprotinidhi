/* Size limits for complaint attachments, shared by the API schema and the public form (no zod here, so the browser
   bundle can import it). Sizes of base64 payloads are counted in characters of the data URL. MongoDB refuses a
   document over 16 MB, so everything a complaint carries together stays well below that (BUG-2026-028). */

export const COMPLAINT_MAX_FILES = 5;
/** Raw size of one chosen file before the browser shrinks photos. */
export const COMPLAINT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** One file as a data URL (5 MB raw is about 6.7 MB in base64). */
export const COMPLAINT_MAX_FILE_B64 = 8 * 1024 * 1024;
/** The voice note as a data URL. */
export const COMPLAINT_MAX_VOICE_B64 = 4 * 1024 * 1024;
export const COMPLAINT_MAX_VOICE_SEC = 180;
/** All files plus the voice note together, as data URLs. */
export const COMPLAINT_MAX_TOTAL_B64 = 12 * 1024 * 1024;
/** Photos are shrunk to this long edge (browser before upload, API again when re-encoding). */
export const COMPLAINT_IMAGE_MAX_EDGE = 1600;
