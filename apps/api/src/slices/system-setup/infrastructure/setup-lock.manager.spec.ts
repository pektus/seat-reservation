import * as fs from 'fs';
import * as path from 'path';
import { SetupLockManager } from './setup-lock.manager.js';

describe('SetupLockManager', () => {
  const testLockDir = path.join(process.cwd(), 'tmp-test-locks');
  const testLockFile = path.join(testLockDir, 'test-setup.lock');
  let lockManager: SetupLockManager;

  beforeEach(() => {
    if (fs.existsSync(testLockFile)) {
      fs.unlinkSync(testLockFile);
    }
    if (fs.existsSync(testLockDir)) {
      fs.rmdirSync(testLockDir);
    }
    lockManager = new SetupLockManager(testLockFile);
  });

  afterAll(() => {
    if (fs.existsSync(testLockFile)) {
      fs.unlinkSync(testLockFile);
    }
    if (fs.existsSync(testLockDir)) {
      fs.rmdirSync(testLockDir);
    }
  });

  it('should return isLocked = false when no lock file exists', () => {
    expect(lockManager.isLocked()).toBe(false);
  });

  it('should create lock file and return isLocked = true after acquireLock', () => {
    const lockAcquired = lockManager.acquireLock('2026-10-16T12:00:00Z');
    expect(lockAcquired).toBe(true);
    expect(lockManager.isLocked()).toBe(true);
    expect(fs.existsSync(testLockFile)).toBe(true);
  });

  it('should prevent acquiring lock twice and preserve original timestamp', () => {
    lockManager.acquireLock('2026-10-16T12:00:00Z');
    const secondAttempt = lockManager.acquireLock('2026-10-16T13:00:00Z');
    expect(secondAttempt).toBe(false);
    expect(lockManager.getLockTimestamp()).toBe('2026-10-16T12:00:00Z');
  });
});

