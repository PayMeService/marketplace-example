import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get<string>('DB_USERNAME', 'postgres'),
        password: cfg.get<string>('DB_PASSWORD', 'postgres'),
        database: cfg.get<string>('DB_NAME', 'marketplace-example'),
        autoLoadEntities: true,
        synchronize: cfg.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        logging: cfg.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
    TerminusModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
