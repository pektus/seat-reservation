import { Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SetupLockManager {
  private readonly logger = new Logger(SetupLockManager.name);
  private readonly lockFilePath: string;

  constructor(@Optional() customPath?: string) {
    this.lockFilePath = customPath || process.env.SETUP_LOCK_FILE || path.join(process.cwd(), 'setup.lock');
  }

  public isLocked(): boolean {
    return fs.existsSync(this.lockFilePath);
  }

  public acquireLock(timestamp?: string): boolean {
    if (this.isLocked()) {
      this.logger.warn(`Attempted to acquire setup lock, but lock file already exists: ${this.lockFilePath}`);
      return false;
    }

    try {
      const dir = path.dirname(this.lockFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload = {
        lockedAt: timestamp || new Date().toISOString(),
        version: '0.1.0'
      };

      fs.writeFileSync(this.lockFilePath, JSON.stringify(payload, null, 2), { encoding: 'utf-8', flag: 'wx' });
      this.logger.log(`Setup lock successfully established at ${this.lockFilePath}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to write setup lock file: ${(err as Error).message}`);
      return false;
    }
  }

  public getLockTimestamp(): string | undefined {
    if (!this.isLocked()) return undefined;
    try {
      const data = fs.readFileSync(this.lockFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.lockedAt;
    } catch {
      return undefined;
    }
  }

  public releaseLock(): boolean {
    if (!this.isLocked()) return true;
    try {
      fs.unlinkSync(this.lockFilePath);
      this.logger.log(`Setup lock successfully removed: ${this.lockFilePath}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to release setup lock file: ${(err as Error).message}`);
      return false;
    }
  }
}

