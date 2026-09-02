import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import {
  ITERATION_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  Subscription,
} from './subscription.entity';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionPriceDto,
} from './dto/subscription.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const rows = await this.subscriptions.listForUser(user.sub);
    return rows.map(toView);
  }

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return toView(await this.subscriptions.create(user.sub, dto));
  }

  /** Reversible stop. Iterations halt; the subscription can be resumed. */
  @Post(':id/pause')
  async pause(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toView(await this.subscriptions.pause(user.sub, id));
  }

  /** Restart a paused subscription. */
  @Post(':id/resume')
  async resume(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toView(await this.subscriptions.resume(user.sub, id));
  }

  /** Terminal. There is no un-cancel — use pause if you may want it back. */
  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toView(await this.subscriptions.cancel(user.sub, id));
  }

  /** Change the per-iteration price, from the next iteration onward. */
  @Patch(':id/price')
  async updatePrice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionPriceDto,
  ) {
    return toView(await this.subscriptions.updatePrice(user.sub, id, dto));
  }
}

function toView(subscription: Subscription) {
  return {
    id: subscription.id,
    paymeSubId: subscription.paymeSubId,
    paymeSubCode: subscription.paymeSubCode,
    subUrl: subscription.subUrl,
    priceMinor: subscription.priceMinor,
    currency: subscription.currency,
    description: subscription.description,
    iterationType: subscription.iterationType,
    iterationTypeLabel:
      ITERATION_TYPE_LABELS[subscription.iterationType] ?? 'Unknown',
    iterations: subscription.iterations,
    iterationsCompleted: subscription.iterationsCompleted,
    status: subscription.status,
    statusLabel:
      SUBSCRIPTION_STATUS_LABELS[subscription.status] ??
      `Unknown (${subscription.status})`,
    startDate: subscription.startDate,
    nextDate: subscription.nextDate,
    buyerName: subscription.buyerName,
    buyerEmail: subscription.buyerEmail,
    buyerCardMask: subscription.buyerCardMask,
    lastError: subscription.lastError,
    createdAt: subscription.createdAt,
  };
}
