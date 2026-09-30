/* One error type; the error middleware renders it as { error: { code, message, details } } (docs/04 §1). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  static badRequest(msg = 'অনুরোধটি সঠিক নয়', details?: unknown) { return new ApiError(400, 'BAD_REQUEST', msg, details); }
  static validation(details: unknown) { return new ApiError(400, 'VALIDATION_FAILED', 'ইনপুট সঠিক নয়', details); }
  static unauthorized(msg = 'লগইন প্রয়োজন') { return new ApiError(401, 'UNAUTHORIZED', msg); }
  static forbidden(msg = 'এই কাজের অনুমতি নেই') { return new ApiError(403, 'FORBIDDEN', msg); }
  /** Foreign-tenant ids also produce this: never 403, so existence is not revealed. */
  static notFound(msg = 'পাওয়া যায়নি') { return new ApiError(404, 'NOT_FOUND', msg); }
  static conflict(code: string, msg: string) { return new ApiError(409, code, msg); }
  static unprocessable(code: string, msg: string, details?: unknown) { return new ApiError(422, code, msg, details); }
  static tooMany(retryAfterSec: number) {
    const e = new ApiError(429, 'RATE_LIMITED', 'অনেক বেশি চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', { retryAfterSec });
    return e;
  }
}
