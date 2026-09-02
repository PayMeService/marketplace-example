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
import { User } from '../auth/user.entity';

/**
 * A PayMe seller, as this marketplace stores it.
 *
 * The whole point of this table is `paymeId` — the MPL. Once create-seller
 * returns, that string is the seller's identity in every subsequent PayMe call
 * (`seller_payme_id` on generate-sale, capture-sale, refund-sale,
 * generate-subscription, get-sellers, ...). Losing it means losing the ability
 * to route money to that seller, so it is stored before anything else happens.
 *
 * The rest of the seller's profile lives on PayMe's side and is fetched with
 * get-sellers rather than mirrored here — approval state, fees and wallet
 * balances all change without notifying you, so a local copy goes stale.
 */
@Entity('sellers')
export class Seller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * PayMe's seller id, e.g. "MPL17883-384086OC-CFKIBLDG-OO2BWFT1".
   * Sent as `seller_payme_id` on every seller-scoped call.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  paymeId: string;

  /**
   * The seller's own secret, returned exactly once by create-seller and never
   * retrievable again.
   *
   * Stored in plaintext here because this is a demo you are meant to read. In
   * production this belongs in a secrets manager or an encrypted column — it is
   * a credential that can act as the seller.
   */
  @Column({ type: 'varchar', length: 255, select: false, nullable: true })
  paymeSecret: string | null;

  /**
   * The seller's PayMe public key (a uuid).
   *
   * Safe to expose to the browser — that is its purpose. Hosted Fields / the
   * JSAPI is initialised with `PayMe.create(publicKey)`, so card data goes from
   * the buyer's browser straight to PayMe's vault and never touches this server.
   * Re-fetchable at any time via GET /sellers/{mpl}/public-keys.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymePublicKey: string | null;

  /** Link PayMe returns for the seller to finish their onboarding details. */
  @Column({ type: 'text', nullable: true })
  signupLink: string | null;

  /** Which of this marketplace's onboarding plans the seller chose. */
  @Column({ type: 'varchar', length: 32 })
  planId: string;

  /** The `market_fee` sent at creation — the marketplace's commission percent. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  marketFee: string;

  @Column({ type: 'varchar', length: 200 })
  businessName: string;

  /**
   * Approval state, refreshed from get-sellers.
   *
   * A seller can transact before being approved, but funds are not released for
   * withdrawal until PayMe has verified their documents (social ID, bank,
   * corporate certificate). Do not gate checkout on this; do surface it.
   */
  @Column({ type: 'boolean', default: false })
  approved: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @ManyToOne(() => User, (user) => user.sellers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
