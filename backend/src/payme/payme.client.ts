import { Injectable, Logger } from '@nestjs/common';
import { PayMeApiError } from '../common/payme-error';
import { PayMeEnvelope } from './payme.types';

/**
 * The transport layer for every PayMe call.
 *
 * Everything PayMe-specific about *how* a request is made lives here, so the
 * feature services below can read like business logic:
 *
 *  - base URL per environment (sandbox vs live)
 *  - `Content-Type: application/json` — PayMe's docs call this out explicitly;
 *    without it you get parse errors that look like validation failures
 *  - the success test (`status_code === 0`), not the HTTP status
 *  - normalising both failure shapes into one PayMeApiError
 *  - redacted request/response logging you can actually paste into a ticket
 */

export type PayMeEnvironment = 'sandbox' | 'production';

const BASE_URLS: Record<PayMeEnvironment, string> = {
  // Trailing slash matters — endpoints are appended directly.
  sandbox: 'https://sandbox.payme.io/api/',
  production: 'https://live.payme.io/api/',
};

/**
 * Fields that must never reach a log line. PayMe's API is designed so a
 * marketplace never handles a raw PAN, but `pay-sale` can carry one for
 * PCI-compliant merchants, and tokens/secrets are bearer credentials.
 */
const REDACTED_KEYS = new Set([
  'credit_card_number',
  'credit_card_cvv',
  'credit_card_exp',
  'payme_client_key',
  'payme_client_secret',
  'seller_payme_secret',
  'buyer_key',
  'password',
]);

export interface PayMeRequestOptions {
  /** HTTP method. PayMe is POST for almost everything; a few reads are GET/PATCH. */
  method?: 'GET' | 'POST' | 'PATCH';
  /** Extra headers, e.g. `PayMe-Partner-Key` for the public-keys endpoint. */
  headers?: Record<string, string>;
  /**
   * Skip the `status_code === 0` check and return the body as-is. Used for the
   * few endpoints that answer with a resource rather than PayMe's envelope
   * (e.g. POST /sellers/{mpl}/tokens).
   */
  rawEnvelope?: boolean;
}

@Injectable()
export class PayMeClient {
  private readonly logger = new Logger(PayMeClient.name);

  /**
   * @param endpoint path relative to the API root, with no leading slash —
   *                 "generate-sale", "sellers/MPL.../public-keys"
   */
  async request<TResponse extends object>(
    environment: PayMeEnvironment,
    endpoint: string,
    body?: unknown,
    options: PayMeRequestOptions = {},
  ): Promise<TResponse> {
    const { method = 'POST', headers = {}, rawEnvelope = false } = options;
    const url = `${BASE_URLS[environment]}${endpoint}`;

    this.logger.debug(
      `-> ${method} ${url} ${body ? JSON.stringify(redact(body)) : ''}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          // PayMe's docs: "Do not forget to add the header
          // Content-Type: application/json to your requests!"
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      // Network-level failure: DNS, TLS, timeout. Nothing reached PayMe, so
      // this is always safe to retry — unlike a 500, which may have charged.
      throw new PayMeApiError(
        endpoint,
        null,
        `Could not reach PayMe at ${url}: ${(cause as Error).message}`,
        null,
        null,
        cause,
      );
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new PayMeApiError(
        endpoint,
        null,
        `PayMe returned a non-JSON body (HTTP ${response.status}): ${text.slice(0, 500)}`,
        null,
        null,
        text,
      );
    }

    this.logger.debug(
      `<- ${response.status} ${endpoint} ${JSON.stringify(redact(payload))}`,
    );

    if (rawEnvelope) {
      if (!response.ok) {
        const envelope = payload as PayMeEnvelope;
        throw this.toError(endpoint, envelope, payload);
      }
      return payload as TResponse;
    }

    const envelope = payload as PayMeEnvelope;

    // The success test. NOT `response.ok`: PayMe answers 200 with
    // status_code 1 for business failures, and 500 with a well-formed error
    // body for validation failures.
    if (envelope?.status_code !== 0) {
      throw this.toError(endpoint, envelope, payload);
    }

    return payload as TResponse;
  }

  private toError(
    endpoint: string,
    envelope: PayMeEnvelope | undefined,
    raw: unknown,
  ): PayMeApiError {
    const details =
      envelope?.status_error_details ??
      `PayMe rejected the ${endpoint} request without a message`;

    this.logger.warn(
      `PayMe ${endpoint} failed: code=${envelope?.status_error_code ?? 'n/a'} ` +
        `details="${details}" info=${JSON.stringify(envelope?.status_additional_info ?? null)} ` +
        `session=${envelope?.session ?? 'n/a'}`,
    );

    return new PayMeApiError(
      endpoint,
      envelope?.status_error_code ?? null,
      details,
      envelope?.status_additional_info ?? null,
      envelope?.session ?? null,
      raw,
    );
  }
}

/** Recursively replace sensitive values before logging. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        REDACTED_KEYS.has(key) ? '[redacted]' : redact(val),
      ]),
    );
  }
  return value;
}
