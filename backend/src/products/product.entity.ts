import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';

/**
 * Something a user lists for sale.
 *
 * `priceMinor` is in minor units (agorot/cents) to match PayMe end to end —
 * see common/money.ts. Storing a decimal here and converting at the API
 * boundary is how rounding errors get into charges.
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** Price in minor units. 5075 = 50.75. PayMe's minimum is 500. */
  @Column({ type: 'int' })
  priceMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'ILS' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @ManyToOne(() => User, (user) => user.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ type: 'uuid' })
  ownerId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
