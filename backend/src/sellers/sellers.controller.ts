import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { SellersService } from './sellers.service';
import { CreateSellerDto } from './dto/create-seller.dto';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  /** The marketplace's own onboarding plans. Public — shown before signup. */
  @Get('plans')
  plans() {
    return this.sellers.listPlans();
  }

  /** Open a PayMe seller (MPL) for the signed-in user. */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSellerDto) {
    const seller = await this.sellers.createSeller(user.sub, dto);
    return this.sellers.describe(seller);
  }

  /**
   * The caller's seller: profile, approval state and live wallet balances.
   *
   * Answers 204 when the user has no seller yet, rather than returning null:
   * Nest serialises a null return as `200 Content-Length: 0`, which a client
   * that parses an empty body as `{}` will read as "a seller with no fields".
   * 204 says "no resource" unambiguously.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const seller = await this.sellers.findByUser(user.sub);
    if (!seller) {
      res.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return this.sellers.describe(seller);
  }

  /**
   * Re-fetch the seller's PayMe public key.
   *
   * The browser needs this to initialise Hosted Fields. Exposing it is safe and
   * intended — it is a *public* key whose only power is to open a tokenization
   * session against PayMe's vault.
   */
  @Post('me/public-key/refresh')
  @UseGuards(JwtAuthGuard)
  async refreshPublicKey(@CurrentUser() user: JwtPayload) {
    const seller = await this.sellers.requireOwnSeller(user.sub);
    return { publicKey: await this.sellers.fetchPublicKey(seller) };
  }
}
