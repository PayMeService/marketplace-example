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
import { Product } from '../products/product.entity';

/**
 * Which integration produced this sale. All three end in the same place — a
 * paid sale in PayMe — but they differ in where the card data is entered and
 * how much of the checkout you own. See docs/03-payment-flows.md.
 */
export enum SaleFlow {
  /** PayMe's hosted page in an iframe. Least work, least control, no PCI scope. */
  Iframe = 'iframe',
  /** PayMe-hosted input fields styled into your own checkout, tokenized in-browser. */
  HostedFields = 'hosted-fields',
  /** Server-to-server pay-sale with an existing buyer token. No UI at all. */
  PaySale = 'pay-sale',
}

/**
 * Local mirror of PayMe's sale status.
 *
 * PayMe is the source of truth; this column is what the callback and the API
 * responses last told us. Never decide anything irreversible from this value
 * alone without a verified signature behind it.
 */
export enum SaleStatus {
  /** Created, nobody has paid yet. */
  Initial = 'initial',
  /** Paid and settled. */
  Completed = 'completed',
  /** J5: funds reserved on the card, awaiting capture. Expires after 168 hours. */
  Authorized = 'authorized',
  Failed = 'failed',
  Refunded = 'refunded',
  PartialRefund = 'partial-refund',
  /** Authorization released without ever being captured. */
  Voided = 'voided',
  Chargeback = 'chargeback',
  Canceled = 'canceled',
}

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * PayMe's sale id ("SALE1788-338419FH-..."). Required by capture-sale,
   * refund-sale, pay-sale and get-buyer-key. Nullable only for the instant
   * between creating the local row and generate-sale returning.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymeSaleId: string | null;

  /** Short numeric code. Display and support only — never an API input. */
  @Column({ type: 'int', nullable: true })
  paymeSaleCode: number | null;

  /**
   * PayMe's transaction id for the completed payment.
   *
   * Note this is a different thing from `transaction_id` on a generate-sale
   * request, which is YOUR order id. PayMe uses the same word for both. This
   * column holds PayMe's guid, which is half the input to the callback
   * signature.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  paymeTransactionId: string | null;

  /** The hosted payment page URL from generate-sale. */
  @Column({ type: 'text', nullable: true })
  saleUrl: string | null;

  @Column({ type: 'varchar', length: 32, default: SaleFlow.Iframe })
  flow: SaleFlow;

  /** "sale" (J4, charge now) or "authorize" (J5, reserve now, capture later). */
  @Column({ type: 'varchar', length: 32, default: 'sale' })
  saleType: string;

  @Column({ type: 'varchar', length: 32, default: SaleStatus.Initial })
  status: SaleStatus;

  /** Amount in minor units. */
  @Column({ type: 'int' })
  priceMinor: number;

  /** Total refunded so far, minor units. Partial refunds accumulate here. */
  @Column({ type: 'int', default: 0 })
  refundedMinor: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 500 })
  productName: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  buyerName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerEmail: string | null;

  /** Masked PAN as reported by PayMe ("532610******5846"). Safe to store and show. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  buyerCardMask: string | null;

  /**
   * Reusable buyer token, present when the sale was created with
   * `capture_buyer: "1"`. Charge it later by sending it as `buyer_key`.
   *
   * This is a bearer credential for that card: anyone holding it can charge the
   * buyer through your account. `select: false` so it never leaves the database
   * by accident in a `find()`.
   */
  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  buyerKey: string | null;

  /** Whether we asked PayMe to tokenize the card on this sale. */
  @Column({ type: 'boolean', default: false })
  captureBuyerRequested: boolean;

  /** Set when an authorization (J5) is settled via capture-sale. */
  @Column({ type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  /** PayMe's error text on the last failed action, for the UI. */
  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /** The most recent full payload PayMe sent us about this sale. */
  @Column({ type: 'jsonb', nullable: true })
  lastPayload: Record<string, unknown> | null;

  @ManyToOne(() => Seller, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller: Seller;

  @Column({ type: 'uuid' })
  sellerId: string;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productId' })
  product: Product | null;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  /**
   * The marketplace user who initiated the purchase, when a buyer did.
   *
   * Null for seller-initiated sales (the seller charging someone who is not a
   * user here). Used only to scope reads: a sale carries buyer details, so it
   * should be visible to the seller who owns it and to the buyer who made it,
   * and to nobody else.
   */
  @Column({ type: 'uuid', nullable: true })
  buyerUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/**
 * Map PayMe's `sale_status` string onto our enum.
 *
 * PayMe's statuses are documented at
 * https://payme.stoplight.io/docs/guides/ort17682q5o8a-sale-statuses?branch=main
 * Unknown values are kept as-is rather than coerced, so a new PayMe status
 * shows up in the UI instead of silently becoming "failed".
 */
export function toSaleStatus(paymeStatus?: string | null): SaleStatus | null {
  if (!paymeStatus) return null;
  const known = Object.values(SaleStatus) as string[];
  return known.includes(paymeStatus) ? (paymeStatus as SaleStatus) : null;
}
