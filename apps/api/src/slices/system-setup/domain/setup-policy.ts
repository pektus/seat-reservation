import { Result } from '../../../common/result.js';

export interface RecoveryAdminInput {
  email: string;
  fullName: string;
  password: string;
}

export class SetupPolicy {
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly MIN_PASSWORD_LENGTH = 12;

  public static validateRecoveryAdmin(input: RecoveryAdminInput): Result<void> {
    if (!input.fullName || input.fullName.trim().length === 0) {
      return Result.fail('Recovery admin full name cannot be empty');
    }

    if (!input.email || !this.EMAIL_REGEX.test(input.email)) {
      return Result.fail('Invalid email format for recovery admin');
    }

    if (!input.password || input.password.length < this.MIN_PASSWORD_LENGTH) {
      return Result.fail(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters long`);
    }

    return Result.ok();
  }

  public static validateCompanyName(name: string): Result<void> {
    if (!name || name.trim().length === 0) {
      return Result.fail('Company name cannot be empty');
    }

    if (name.trim().length > 150) {
      return Result.fail('Company name must not exceed 150 characters');
    }

    return Result.ok();
  }
}

