import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@seat-reservation/contracts';
import { DemoSandboxController } from './demo-sandbox.controller.js';
import { DemoSeederService } from '../infrastructure/demo-seeder.service.js';
import { SetupLockManager } from '../../system-setup/infrastructure/setup-lock.manager.js';

describe('DemoSandboxController (Integration Spec)', () => {
  let controller: DemoSandboxController;
  let service: Partial<DemoSeederService>;
  let lockManager: { isLocked: jest.Mock };

  beforeEach(async () => {
    service = {
      seedDemoData: jest.fn().mockResolvedValue({
        success: true,
        message: 'Seeded',
        demoCompany: { id: 'comp-1', name: 'Acme Tech HQ' },
        demoBuilding: { id: 'bldg-1', name: 'Main Tower' },
        demoFloor: { id: 'flr-4', name: 'Floor 4', desksCount: 12 },
        demoSampleDate: '2026-10-16'
      }),
      resetDemoData: jest.fn().mockResolvedValue({
        success: true,
        clearedReservationsCount: 3,
        message: 'Reset'
      })
    };

    lockManager = { isLocked: jest.fn().mockReturnValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DemoSandboxController],
      providers: [
        { provide: DemoSeederService, useValue: service },
        { provide: SetupLockManager, useValue: lockManager }
      ]
    }).compile();

    controller = module.get<DemoSandboxController>(DemoSandboxController);
  });

  describe('when setup is unlocked', () => {
    it('should trigger seedDemoData and return response', async () => {
      const res = await controller.seedDemoData();
      expect(res.success).toBe(true);
      expect(res.demoFloor.desksCount).toBe(12);
      expect(service.seedDemoData).toHaveBeenCalled();
    });

    it('should trigger resetDemoData and return response', async () => {
      const res = await controller.resetDemoData();
      expect(res.success).toBe(true);
      expect(res.clearedReservationsCount).toBe(3);
      expect(service.resetDemoData).toHaveBeenCalled();
    });
  });

  describe('when setup is locked', () => {
    beforeEach(() => {
      lockManager.isLocked.mockReturnValue(true);
    });

    it('should forbid seeding demo data after setup', async () => {
      await expect(controller.seedDemoData()).rejects.toThrow(ForbiddenException);
      expect(service.seedDemoData).not.toHaveBeenCalled();
    });

    it('should forbid demo reset when called without admin authorization', async () => {
      // Unauthenticated call
      await expect(controller.resetDemoData()).rejects.toThrow(ForbiddenException);
      // Non-admin call
      const regularUserReq = { user: { role: UserRole.EMPLOYEE, roles: [UserRole.EMPLOYEE], isRecoveryAdmin: false } };
      await expect(controller.resetDemoData(regularUserReq)).rejects.toThrow(ForbiddenException);
      expect(service.resetDemoData).not.toHaveBeenCalled();
    });

    it('should permit demo reset when called by an authorized system admin', async () => {
      const adminReq = {
        user: { role: UserRole.SYSTEM_ADMIN, roles: [UserRole.SYSTEM_ADMIN], isRecoveryAdmin: false }
      };
      const res = await controller.resetDemoData(adminReq);
      expect(res.success).toBe(true);
      expect(service.resetDemoData).toHaveBeenCalled();
    });

    it('should permit demo reset when called by break-glass recovery admin', async () => {
      const recoveryAdminReq = {
        user: { role: UserRole.SYSTEM_ADMIN, roles: [UserRole.SYSTEM_ADMIN], isRecoveryAdmin: true }
      };
      const res = await controller.resetDemoData(recoveryAdminReq);
      expect(res.success).toBe(true);
      expect(service.resetDemoData).toHaveBeenCalled();
    });
  });
});

