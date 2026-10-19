import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../system-setup/infrastructure/database.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  const validPayload = {
    sub: 'user-id',
    email: 'user@example.com',
    fullName: 'Example User',
    role: 'EMPLOYEE',
    roles: ['EMPLOYEE'],
    isRecoveryAdmin: false,
    tokenVersion: 1
  };

  it('rejects a versioned token when the application database has not been initialized', async () => {
    const databaseService = {
      query: jest.fn().mockRejectedValue({ code: '42P01' })
    } as unknown as DatabaseService;
    const strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'test-secret' }),
      databaseService
    );

    await expect(strategy.validate(validPayload)).rejects.toThrow(
      new UnauthorizedException(
        'The application database is not initialized or this session is no longer valid. Complete setup or sign in again.'
      )
    );
  });

  it('propagates database errors other than a missing users table', async () => {
    const databaseError = new Error('Database connection failed');
    const databaseService = {
      query: jest.fn().mockRejectedValue(databaseError)
    } as unknown as DatabaseService;
    const strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'test-secret' }),
      databaseService
    );

    await expect(strategy.validate(validPayload)).rejects.toBe(databaseError);
  });
});
