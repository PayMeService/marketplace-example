import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A failed PayMe API call, normalised into one exception type.
 *
 * INTEGRATION RULE #2: a PayMe error is not signalled by the HTTP status code.
 * PayMe answers 200 OK with `status_code: 1` for business failures, and answers
 * HTTP 500 with a perfectly well-formed error body for validation problems.
 * The only reliable success test is `status_code === 0`.
 *
 * Every error body carries the same four fields:
 *   status_code           1 (0 means success)
 *   status_error_code     PayMe's stable numeric error code — log and switch on this
 *   status_error_details  human-readable message, in `language` if you sent one
 *   status_additional_info  usually the offending parameter name, or a value
 *
 * There is also a `session` field on sandbox responses; include it when you open
 * a support ticket, it is how PayMe finds the request in their logs.
 */
export class PayMeApiError extends HttpException {
  constructor(
    /** The PayMe endpoint that failed, e.g. "generate-sale". */
    readonly endpoint: string,
    /** PayMe's numeric error code (`status_error_code`). */
    readonly paymeErrorCode: number | null,
    /** PayMe's human-readable message (`status_error_details`). */
    readonly paymeErrorDetails: string,
    /** Usually the offending field name (`status_additional_info`). */
    readonly additionalInfo: unknown,
    /** PayMe's request session id — quote this to PayMe support. */
    readonly session: string | null,
    /** Raw response body, kept for logging. */
    readonly raw: unknown,
  ) {
    super(
      {
        message: paymeErrorDetails || `PayMe call to ${endpoint} failed`,
        payme: {
          endpoint,
          errorCode: paymeErrorCode,
          details: paymeErrorDetails,
          additionalInfo,
          session,
        },
      },
      // Surface as 502: the upstream provider rejected us, the caller's own
      // request to *this* API was well-formed. Validation errors we can detect
      // ourselves should be rejected with 400 before ever reaching PayMe.
      HttpStatus.BAD_GATEWAY,
    );
  }
}
