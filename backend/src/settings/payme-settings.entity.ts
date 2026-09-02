import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * PayMe credentials, stored so they can be changed at runtime from the UI.
 *
 * A single row, id = 1. Seeded from the environment on first boot; after that
 * the row wins, so the Settings page can point the demo at a different partner
 * account without a redeploy.
 *
 * In a real deployment the secret belongs in a secrets manager (Vault, AWS
 * Secrets Manager, GCP Secret Manager), not in a database column — the whole
 * point of `clientSecret` is that it never leaves your infrastructure. It lives
 * here because a self-contained example has to be configurable by whoever
 * clones it.
 */
@Entity('payme_settings')
export class PayMeSettings {
  @PrimaryColumn({ type: 'int' })
  id: number = 1;

  /** "sandbox" or "production" — selects the API base URL. */
  @Column({ type: 'varchar', length: 16, default: 'sandbox' })
  environment: string;

  /**
   * The PayMe Partner Key. Sent as `payme_client_key` on partner-scoped calls
   * and as the `PayMe-Partner-Key` header on a few REST endpoints.
   */
  @Column({ type: 'varchar', length: 255, default: '' })
  clientKey: string;

  /**
   * The PayMe partner secret. NEVER sent to PayMe. Used only to recompute the
   * md5 `payme_signature` on incoming callbacks.
   */
  @Column({ type: 'varchar', length: 255, default: '' })
  clientSecret: string;

  /** Your marketplace's own MPL — used for partner-scoped token calls. */
  @Column({ type: 'varchar', length: 128, default: '' })
  marketplaceMpl: string;

  /**
   * Public base URL of the API, as PayMe's servers see it. Server-to-server
   * CALLBACK urls are built from this.
   *
   * PayMe rejects anything resolving to localhost, so in local development this
   * is a tunnel URL (cloudflared/ngrok) or callbacks simply do not arrive.
   */
  @Column({ type: 'varchar', length: 255, default: '' })
  publicBaseUrl: string;

  /**
   * Public base URL of the browser app. BUYER-FACING return urls
   * (`sale_return_url`, `sub_return_url`) are built from this.
   *
   * Separate from publicBaseUrl because the two are different origins in
   * development — Vite on :5173, the API on :3000 — while in production nginx
   * serves the SPA and proxies /api on one origin and they are the same. Sending
   * the buyer to the API's origin lands them on a 404 instead of the receipt.
   */
  @Column({ type: 'varchar', length: 255, default: '' })
  publicAppUrl: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
