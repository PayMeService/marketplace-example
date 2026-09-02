import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /** Everything on offer, for the storefront. */
  async listActive(): Promise<Product[]> {
    return this.products.find({
      where: { active: true },
      relations: { owner: true },
      order: { createdAt: 'DESC' },
    });
  }

  async listMine(ownerId: string): Promise<Product[]> {
    return this.products.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(ownerId: string, dto: CreateProductDto): Promise<Product> {
    return this.products.save(
      this.products.create({
        ownerId,
        name: dto.name,
        description: dto.description ?? '',
        priceMinor: dto.priceMinor,
        currency: dto.currency,
      }),
    );
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.requireOwned(id, ownerId);
    Object.assign(product, dto);
    return this.products.save(product);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.products.remove(await this.requireOwned(id, ownerId));
  }

  async findById(id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async requireOwned(id: string, ownerId: string): Promise<Product> {
    const product = await this.products.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) {
      throw new ForbiddenException('That product belongs to someone else');
    }
    return product;
  }
}
