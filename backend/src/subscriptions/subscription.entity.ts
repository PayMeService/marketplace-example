import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Seller } from '../sellers/seller.entity';

/**
 * PayMe's subscription statuses, as numbers on the wire.
 * https://payme.stoplight.io/docs/guides/n4lq9aw5a1jnh-subscription-statuses?branch=main
 */
export enum SubscriptionStatus {
  /** Created, but the buyer has not paid the first iteration. */
  Initial = 1,
  /** Paid and running. */
  Active = 2,
  Paused = 3,
  Failed = 4,
  Cancelled = 5,
  /** All iterations ran. */
  Completed = 6,
  /** An iteration failed; PayMe will retry automatically. */
  FailedPendingRetry = 76,
}

/** `sub_iteration_type` — how often an iteration is charged. */
export enum IterationType {
  Daily = 1,
  Weekly = 2,
  Monthly = 3,
  Annually = 4,
}

export const SUBSCRIPTION_STATUS_LABELS: Record<number, string> = {
  1: 'Initial — awaiting first payment',
  2: 'Active',
  3: 'Paused',
  4: 'Failed',
  5: 'Cancelled',
  6: 'Completed',
  76: 'Failed — automatic retry pending',
};

export const ITERATION_TYPE_LABELS: Record<number, string> = {
  1: 'Daily',
  2: 'Weekly',
  3: 'Monthly',
  4: 'Annually',
};

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** PayMe's subscription id ("SUB16885-..."). Every later action needs it. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymeSubId: string | null;

  @Column({ type: 'int', nullable: true })
  paymeSubCode: number | null;

  /**
   * The hosted page where the buyer enters payment details to activate the
   * subscription. Null when the subscription was created with a `buyer_key`,
   * because there is then nothing for the buyer to do — it activates at once.
   */
  @Column({ type: 'text', nullable: true })
  subUrl: string | null;

  /** Price of ONE iteration, in minor units. Not the lifetime total. */
  @Column({ type: 'int' })
  priceMinor: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'int', default: IterationType.Monthly })
  iterationType: number;

  /** Number of iterations to run. -1 means "until cancelled". */
  @Column({ type: 'int', default: -1 })
  iterations: number;

  @Column({ type: 'int', default: 0 })
  iterationsCompleted: number;

  /**
   * Stored as an int because that is what PayMe sends, but typed as the enum so
   * comparisons are checked. PayMe may add statuses (76 was added for automatic
   * retry), so treat an unrecognised value as informational rather than
   * coercing it — `applyDetails` widens on write for exactly that reason.
   */
  @Column({ type: 'int', default: SubscriptionStatus.Initial })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startDate: Date | null;

  /** When PayMe will charge the next iteration. */
  @Column({ type: 'timestamptz', nullable: true })
  nextDate: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  buyerName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerEmail: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  buyerCardMask: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'jsonb', nullable: true })
  lastPayload: Record<string, unknown> | null;

  @ManyToOne(() => Seller, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller: Seller;

  @Column({ type: 'uuid' })
  sellerId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
