import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { Seller } from '../sellers/seller.entity';

/**
 * Roles in this marketplace.
 *
 * `User` is anyone registered: they can list products. Becoming a `Seller`
 * means a PayMe seller (MPL) has been created for them and money can be routed
 * to their wallet. `Admin` operates the marketplace itself.
 */
export enum UserRole {
  User = 'user',
  Seller = 'seller',
  Admin = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  @Column({ type: 'varchar', length: 32, default: UserRole.User })
  role: UserRole;

  @OneToMany(() => Product, (product) => product.owner)
  products: Product[];

  @OneToMany(() => Seller, (seller) => seller.user)
  sellers: Seller[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
