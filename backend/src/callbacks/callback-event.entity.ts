import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CallbackKind {
  Sale = 'sale',
  Subscription = 'subscription',
  Seller = 'seller',
}

/**
 * Every callback PayMe sends us, stored verbatim.
 *
 * This table exists for two reasons beyond the UI:
 *
 *  1. IDEMPOTENCY. PayMe retries a callback it could not deliver, and the same
 *     notification can legitimately arrive more than once. Recording what we
 *     have already processed is what stops an order shipping twice.
 *
 *  2. FORENSICS. When a payment "did not go through", the first question is
 *     always whether the callback arrived and what it said. A raw copy of the
 *     body — including rejected ones — answers that in seconds.
 *
 * Rejected callbacks are stored too, deliberately: a run of `invalid`
 * signatures is either a misconfigured secret or someone probing the endpoint,
 * and you cannot see either if you drop them at the door.
 */
@Entity('callback_events')
export class CallbackEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  kind: CallbackKind;

  /** PayMe's event type: sale-complete, sub-iteration-success, seller-approve, ... */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  notifyType: string | null;

  /** payme_sale_id / sub_payme_id / seller_payme_id, whichever applies. */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  entityId: string | null;

  /** PayMe's transaction guid — the other half of the signature input. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymeTransactionId: string | null;

  /** valid | invalid | unsigned | unverifiable — see payme/payme-signature.ts. */
  @Column({ type: 'varchar', length: 32 })
  signatureStatus: string;

  /** Human-readable explanation of the signature outcome. */
  @Column({ type: 'text' })
  signatureReason: string;

  /** Whether we let this callback change application state. */
  @Column({ type: 'boolean', default: false })
  applied: boolean;

  /** Why it was not applied, when it was not. */
  @Column({ type: 'text', nullable: true })
  skippedReason: string | null;

  /** The body exactly as received. */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  receivedAt: Date;
}
