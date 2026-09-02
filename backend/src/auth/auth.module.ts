import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { User } from './user.entity';

type ExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

/** Global so the guards can be applied by any feature module. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET', 'dev-only-secret'),
        signOptions: {
          // @nestjs/jwt types expiresIn as a literal ms duration ("12h", "7d")
          // rather than a plain string, so a value read from config needs the
          // cast. jsonwebtoken validates the format at signing time.
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '12h') as ExpiresIn,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
