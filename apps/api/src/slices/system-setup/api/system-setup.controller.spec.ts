import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SystemSetupController } from './system-setup.controller.js';
import { SystemSetupService } from '../system-setup.service.js';
import { SetupLockGuard } from './guards/setup-lock.guard.js';
import { SetupLockManager } from '../infrastructure/setup-lock.manager.js';
import { AuthProviderType } from '@seat-reservation/contracts';

describe('SystemSetupController (Integration Spec)', () => {
  let controller: SystemSetupController;
  let setupService: Partial<SystemSetupService>;
  let lockManager: Partial<SetupLockManager>;

  beforeEach(async () => {
    setupService = {
      getStatus: jest.fn().mockResolvedValue({
        isSetupCompleted: false,
        installedVersion: '0.1.0'
      }),
      testDatabase: jest.fn().mockResolvedValue({
        success: true,
        latencyMs: 12,
        message: 'Connected'
      }),
      initializeSystem: jest.fn().mockResolvedValue({
        isSetupCompleted: true,
        setupLockedAt: '2026-10-16T12:00:00Z',
        authProviderType: AuthProviderType.LOCAL,
        installedVersion: '0.1.0'
      })
    };

    lockManager = {
      isLocked: jest.fn().mockReturnValue(false)
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemSetupController],
      providers: [
        { provide: SystemSetupService, useValue: setupService },
        { provide: SetupLockManager, useValue: lockManager },
        SetupLockGuard
      ]
    }).compile();

    controller = module.get<SystemSetupController>(SystemSetupController);
  });

  it('should return initial setup status when unlocked', async () => {
    const status = await controller.getStatus();
    expect(status.isSetupCompleted).toBe(false);
    expect(setupService.getStatus).toHaveBeenCalled();
  });

  it('should test database connection successfully', async () => {
    const res = await controller.testDatabase({
      host: 'localhost',
      port: 5432,
      database: 'seat_reservation_db',
      user: 'seatadmin',
      password: 'password'
    });
    expect(res.success).toBe(true);
    expect(setupService.testDatabase).toHaveBeenCalled();
  });

  it('should initialize system and return completed status', async () => {
    const res = await controller.initializeSystem({
      database: {
        host: 'localhost',
        port: 5432,
        database: 'seat_reservation_db',
        user: 'seatadmin'
      },
      recoveryAdmin: {
        email: 'admin@company.local',
        fullName: 'Recovery Admin',
        password: 'SuperSecret123!Password'
      },
      authProvider: {
        type: AuthProviderType.LOCAL
      },
      companyName: 'Acme Global'
    });

    expect(res.isSetupCompleted).toBe(true);
    expect(setupService.initializeSystem).toHaveBeenCalled();
  });
});

