import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkplaceManagementService } from './workplace-management.service.js';
import { DatabaseService } from '../system-setup/infrastructure/database.service.js';
import { UserRole, DeskType } from '@seat-reservation/contracts';
import { AuthenticatedUserPayload } from '../identity-access/decorators/current-user.decorator.js';

describe('WorkplaceManagementService (Building Scopes & Floor Plan Replacement Spec)', () => {
  let service: WorkplaceManagementService;
  let dbQueryMock: jest.Mock;
  let dbClientQueryMock: jest.Mock;
  let mockClient: any;

  const adminUser: AuthenticatedUserPayload = {
    id: 'admin-1',
    email: 'admin@acme.com',
    fullName: 'Admin',
    role: UserRole.SYSTEM_ADMIN,
    roles: [UserRole.SYSTEM_ADMIN],
    isRecoveryAdmin: false
  };

  const scopedManager: AuthenticatedUserPayload = {
    id: 'mgr-1',
    email: 'mgr@acme.com',
    fullName: 'Manager Alpha',
    role: UserRole.BUILDING_MANAGER,
    roles: [UserRole.BUILDING_MANAGER],
    isRecoveryAdmin: false,
    buildingScopeIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
  };

  beforeEach(async () => {
    dbQueryMock = jest.fn();
    dbClientQueryMock = jest.fn();
    mockClient = {
      query: dbClientQueryMock,
      release: jest.fn()
    };

    const mockDbService = {
      query: dbQueryMock,
      getPool: jest.fn().mockReturnValue({
        connect: jest.fn().mockResolvedValue(mockClient),
        query: dbQueryMock
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkplaceManagementService,
        { provide: DatabaseService, useValue: mockDbService }
      ]
    }).compile();

    service = module.get<WorkplaceManagementService>(WorkplaceManagementService);
  });

  describe('Building Scopes Enforcement', () => {
    it('should permit SYSTEM_ADMIN to create floor in any building', async () => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ id: 'flr-1', building_id: '99999999-9999-9999-9999-999999999999', floor_number: 1, name: 'First Floor' }]
      });

      const res = await service.createFloor(
        { buildingId: '00000000-0000-0000-0000-000000000001', floorNumber: 1, name: 'First Floor' },
        adminUser
      );
      expect(res.name).toBe('First Floor');
    });

    it('should permit BUILDING_MANAGER to create floor in assigned building scope', async () => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ id: 'flr-1', building_id: '11111111-1111-1111-1111-111111111111', floor_number: 1, name: 'First Floor' }]
      });

      const res = await service.createFloor(
        { buildingId: '11111111-1111-1111-1111-111111111111', floorNumber: 1, name: 'First Floor' },
        scopedManager
      );
      expect(res.name).toBe('First Floor');
    });

    it('should deny BUILDING_MANAGER when creating floor in unassigned building', async () => {
      await expect(
        service.createFloor(
          { buildingId: '99999999-9999-9999-9999-999999999999', floorNumber: 1, name: 'Out of Scope Floor' },
          scopedManager
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny BUILDING_MANAGER when deleting floor belonging to out-of-scope building', async () => {
      // Mock lookup: floor belongs to 99999999-9999-9999-9999-999999999999 (not in scopes)
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ building_id: '99999999-9999-9999-9999-999999999999' }]
      });

      await expect(service.deleteFloor('77777777-7777-7777-7777-777777777777', scopedManager)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should permit BUILDING_MANAGER to delete floor belonging to in-scope building', async () => {
      // 1. Scope check lookup: floor belongs to 11111111-1111-1111-1111-111111111111
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ building_id: '11111111-1111-1111-1111-111111111111' }]
      });
      // 2. Delete query
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ id: '00000000-0000-0000-0000-000000000002' }]
      });

      await service.deleteFloor('00000000-0000-0000-0000-000000000002', scopedManager);
      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM floors'),
        ['00000000-0000-0000-0000-000000000002']
      );
    });
  });

  describe('Floor Plan Replacement & Desk Review Flags', () => {
    it('should flag existing desks with needs_position_review = TRUE and record previous_floor_plan_id on replacement', async () => {
      const floorId = '00000000-0000-0000-0000-000000000003';
      const priorPlanId = 'plan-v1';
      const newPlanId = 'plan-v2';

      // 1. Floor lookup for scope assertion
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ building_id: '11111111-1111-1111-1111-111111111111' }]
      });

      // 2. Transaction queries on client:
      // BEGIN
      dbClientQueryMock.mockResolvedValueOnce({});
      // floorCheck
      dbClientQueryMock.mockResolvedValueOnce({ rows: [{ id: floorId }] });
      // versionRes (max_version: 1, existing_plans_count: 1)
      dbClientQueryMock.mockResolvedValueOnce({
        rows: [{ max_version: 1, existing_plans_count: 1 }]
      });
      // priorActiveRes
      dbClientQueryMock.mockResolvedValueOnce({
        rows: [{ id: priorPlanId }]
      });
      // UPDATE floor_plans SET is_active = FALSE
      dbClientQueryMock.mockResolvedValueOnce({});
      // INSERT new floor_plan
      dbClientQueryMock.mockResolvedValueOnce({
        rows: [
          {
            id: newPlanId,
            floor_id: floorId,
            file_path: '/new-plan.png',
            mime_type: 'image/png',
            width_px: 1200,
            height_px: 800,
            version: 2,
            is_active: true,
            uploaded_at: new Date()
          }
        ]
      });
      // UPDATE desks (desk flag review update query)
      dbClientQueryMock.mockResolvedValueOnce({ rowCount: 12 });
      // COMMIT
      dbClientQueryMock.mockResolvedValueOnce({});

      const result = await service.uploadOrReplaceFloorPlan(
        floorId,
        {
          filePath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          mimeType: 'image/png'
        },
        scopedManager
      );

      expect(result.id).toBe(newPlanId);
      expect(result.version).toBe(2);

      // Verify desk review flagging query was called with previous plan id and new plan id
      const deskUpdateCall = dbClientQueryMock.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('UPDATE desks') && call[0].includes('needs_position_review = TRUE')
      );
      expect(deskUpdateCall).toBeDefined();
      expect(deskUpdateCall[1]).toEqual([priorPlanId, newPlanId, floorId]);
    });

    it('should allow manager to acknowledge desk review and clear review flag', async () => {
      const deskId = '00000000-0000-0000-0000-000000000004';

      // 1. Desk scope lookup
      dbQueryMock.mockResolvedValueOnce({
        rows: [{ building_id: '11111111-1111-1111-1111-111111111111' }]
      });
      // 2. Desk update query
      dbQueryMock.mockResolvedValueOnce({
        rows: [
          {
            id: deskId,
            floor_id: 'flr-1',
            code: 'D-01',
            label: 'Desk 1',
            desk_type: 'STANDARD',
            x_coordinate_pct: '45.00',
            y_coordinate_pct: '50.00',
            is_active: true,
            needs_position_review: false,
            amenities: []
          }
        ]
      });

      const ack = await service.acknowledgeDeskReview(deskId, scopedManager);
      expect(ack.needsPositionReview).toBe(false);
      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('needs_position_review = FALSE'),
        [deskId]
      );
    });
  });
});
