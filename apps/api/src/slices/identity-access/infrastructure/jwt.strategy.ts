import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUserPayload } from '../decorators/current-user.decorator.js';
import { DatabaseService } from '../../system-setup/infrastructure/database.service.js';

export interface JwtTokenPayload {
  sub: string;
  email: string;
  fullName: string;
  role: string;
  roles: string[];
  isRecoveryAdmin: boolean;
  buildingScopeId?: string;
  buildingScopeIds?: string[];
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly databaseService: DatabaseService
  ) {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = configService.get<string>('JWT_SECRET');
    if (isProduction && !secret) {
      throw new Error('FATAL: JWT_SECRET environment variable must be set in production mode.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'super-secret-dev-jwt-key-replace-in-production-min-32-chars'
    });
  }

  async validate(payload: JwtTokenPayload): Promise<AuthenticatedUserPayload> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Malformed or expired authentication token');
    }

    // Verify token_version against current database state to enforce immediate revocation on role changes
    if (payload.tokenVersion !== undefined) {
      const userRes = await this.databaseService.query(
        'SELECT token_version, is_active FROM users WHERE id = $1',
        [payload.sub]
      );
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        throw new UnauthorizedException('User account has been deactivated or removed');
      }
      if (userRes.rows[0].token_version !== payload.tokenVersion) {
        throw new UnauthorizedException('Session token has been invalidated due to a role or permission change. Please sign in again.');
      }
    }

    const buildingScopeIds = payload.buildingScopeIds || (payload.buildingScopeId ? [payload.buildingScopeId] : []);

    return {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role as any,
      roles: (payload.roles || [payload.role]) as any,
      isRecoveryAdmin: payload.isRecoveryAdmin,
      buildingScopeId: payload.buildingScopeId || buildingScopeIds[0],
      buildingScopeIds
    };
  }
}

