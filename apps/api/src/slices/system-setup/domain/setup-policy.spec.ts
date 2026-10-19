import { SetupPolicy } from './setup-policy.js';

describe('SetupPolicy (Domain Rules)', () => {
  it('should accept valid recovery admin configuration with strong password', () => {
    const result = SetupPolicy.validateRecoveryAdmin({
      email: 'admin@company.local',
      fullName: 'Master Recovery Admin',
      password: 'StrongRecoveryPassword123!'
    });

    expect(result.isSuccess).toBe(true);
  });

  it('should reject recovery admin with password less than 12 characters', () => {
    const result = SetupPolicy.validateRecoveryAdmin({
      email: 'admin@company.local',
      fullName: 'Master Recovery Admin',
      password: 'short'
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Password must be at least 12 characters');
  });

  it('should reject invalid recovery admin email address', () => {
    const result = SetupPolicy.validateRecoveryAdmin({
      email: 'not-an-email',
      fullName: 'Master Recovery Admin',
      password: 'StrongRecoveryPassword123!'
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Invalid email format');
  });

  it('should reject empty company name', () => {
    const result = SetupPolicy.validateCompanyName('   ');
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Company name cannot be empty');
  });

  it('should allow valid company name', () => {
    const result = SetupPolicy.validateCompanyName('Acme Corporation');
    expect(result.isSuccess).toBe(true);
  });
});

