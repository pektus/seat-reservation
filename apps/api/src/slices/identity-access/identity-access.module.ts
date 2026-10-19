import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { SystemSetupModule } from '../system-setup/system-setup.module.js';
import { AuthController } from './api/auth.controller.js';
import { IdentityAccessService } from './identity-access.service.js';
import { JwtStrategy } from './infrastructure/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

/**
 * IdentityAccessModule - Slice 2
 * Handles authentication (Local recovery admin, SSO tokens),
 * JWT generation, and Role-Based Access Control (RBAC).
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const secret = configService.get<string>('JWT_SECRET');
        if (isProduction && !secret) {
          throw new Error('FATAL: JWT_SECRET environment variable must be set in production mode.');
        }
        return {
          secret: secret || 'super-secret-dev-jwt-key-replace-in-production-min-32-chars',
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '8h'
          }
        };
      }
    }),
    SystemSetupModule
  ],
  controllers: [AuthController],
  providers: [
    IdentityAccessService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard
  ],
  exports: [
    IdentityAccessService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    PassportModule,
    JwtModule
  ]
})
export class IdentityAccessModule {}
