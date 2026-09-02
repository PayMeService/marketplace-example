import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'));

  // PayMe POSTs callbacks as application/x-www-form-urlencoded. Nest wires
  // both parsers by default; they are re-registered explicitly here so the
  // requirement is visible rather than inherited — dropping urlencoded is a
  // silent way to break every callback.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Note for callback routes: this rejects unknown properties, which is why
      // CallbacksController types its body as a plain record rather than a DTO.
      // PayMe's payloads carry many fields and gain more between versions.
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  const prefix = config.get<string>('API_PREFIX', 'api');
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on http://0.0.0.0:${port}/${prefix}`);
  logger.log(
    `PayMe environment: ${config.get<string>('PAYME_ENV', 'sandbox')}`,
  );

  // PayMe validates BOTH url fields it is given and rejects the whole request
  // with error 21 ("Please verify URL validity") if either resolves to
  // localhost. The services omit them rather than let generate-sale fail, but
  // say so loudly — silently missing callbacks is a confusing way to develop.
  const isLocal = (url: string) =>
    /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);

  const publicBaseUrl = config.get<string>('PUBLIC_BASE_URL', '');
  if (isLocal(publicBaseUrl)) {
    logger.warn(
      `PUBLIC_BASE_URL is ${publicBaseUrl}. PayMe refuses localhost callback URLs, so ` +
        `sale_callback_url/sub_callback_url are omitted and NO CALLBACKS WILL ARRIVE. ` +
        `Run a tunnel (cloudflared tunnel --url http://localhost:${port}) and set PUBLIC_BASE_URL to it, ` +
        `or exercise the handlers with POST /${prefix}/callbacks/payme/simulate.`,
    );
  }

  const publicAppUrl = config.get<string>('PUBLIC_APP_URL', publicBaseUrl);
  if (isLocal(publicAppUrl)) {
    logger.warn(
      `PUBLIC_APP_URL is ${publicAppUrl}. PayMe validates sale_return_url too and rejects ` +
        `localhost with error 21, so it is omitted and buyers will land on the return URL ` +
        `configured on the PayMe account instead of this app's receipt page.`,
    );
  }
}
void bootstrap();
