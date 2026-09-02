import { Global, Module } from '@nestjs/common';
import { PayMeClient } from './payme.client';

/** The PayMe transport, available everywhere. Stateless — credentials are passed per call. */
@Global()
@Module({
  providers: [PayMeClient],
  exports: [PayMeClient],
})
export class PayMeModule {}
