import { Test, TestingModule } from '@nestjs/testing';
import { WorkplaceController } from './workplace.controller.js';
import { WorkplaceManagementService } from '../workplace-management.service.js';
import { DeskType } from '@seat-reservation/contracts';
import { Reflector } from '@nestjs/core';

describe('WorkplaceController (Integration Spec)', () => {
  let controller: WorkplaceController;
  let service: Partial<WorkplaceManagementService>;

  beforeEach(async () => {
    service = {
      listBuildings: jest.fn().mockResolvedValue([
        { id: 'bldg-1', companyId: 'comp-1', name: 'Main Campus', address: '123 Tech Way', timezone: 'UTC' }
      ]),
      listFloors: jest.fn().mockResolvedValue([
        { id: 'flr-4', buildingId: 'bldg-1', floorNumber: 4, name: 'Floor 4' }
      ]),
      listDesksForFloor: jest.fn().mockResolvedValue([
        {
          id: 'desk-1',
          floorId: 'flr-4',
          code: 'D-01',
          label: 'Window Desk 1',
          deskType: DeskType.STANDARD,
          xCoordinatePct: 35.5,
          yCoordinatePct: 40.2,
          isActive: true,
          needsPositionReview: false,
          amenities: []
        }
      ]),
      createDesk: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'desk-new',
          floorId: dto.floorId,
          code: dto.code,
          label: dto.label,
          deskType: dto.deskType,
          xCoordinatePct: dto.xCoordinatePct,
          yCoordinatePct: dto.yCoordinatePct,
          isActive: true,
          needsPositionReview: false,
          amenities: []
        })
      ),
      updateDeskCoordinates: jest.fn().mockImplementation((id, dto) =>
        Promise.resolve({
          id,
          floorId: 'flr-4',
          code: 'D-01',
          label: 'Window Desk 1',
          deskType: DeskType.STANDARD,
          xCoordinatePct: dto.xCoordinatePct,
          yCoordinatePct: dto.yCoordinatePct,
          isActive: true,
          needsPositionReview: false,
          amenities: []
        })
      ),
      acknowledgeDeskReview: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          floorId: 'flr-4',
          code: 'D-01',
          label: 'Window Desk 1',
          deskType: DeskType.STANDARD,
          xCoordinatePct: 35.5,
          yCoordinatePct: 40.2,
          isActive: true,
          needsPositionReview: false,
          amenities: []
        })
      )
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkplaceController],
      providers: [
        { provide: WorkplaceManagementService, useValue: service },
        Reflector
      ]
    }).compile();

    controller = module.get<WorkplaceController>(WorkplaceController);
  });

  it('should list buildings', async () => {
    const buildings = await controller.listBuildings();
    expect(buildings.length).toBe(1);
    expect(buildings[0].name).toBe('Main Campus');
  });

  it('should list desks on floor', async () => {
    const desks = await controller.listDesks('flr-4');
    expect(desks.length).toBe(1);
    expect(desks[0].code).toBe('D-01');
  });

  it('should create desk with percentage coordinates', async () => {
    const newDesk = await controller.createDesk('flr-4', {
      code: 'D-02',
      label: 'Corner Desk',
      deskType: DeskType.STANDING,
      xCoordinatePct: 60,
      yCoordinatePct: 75
    });

    expect(newDesk.code).toBe('D-02');
    expect(newDesk.xCoordinatePct).toBe(60);
    expect(service.createDesk).toHaveBeenCalled();
  });

  it('should acknowledge desk position review', async () => {
    const ack = await controller.acknowledgeDeskReview('desk-1');
    expect(ack.needsPositionReview).toBe(false);
    expect(service.acknowledgeDeskReview).toHaveBeenCalledWith('desk-1', undefined);
  });

  it('should pass authenticated user context to createDesk for building scope verification', async () => {
    const managerUser = {
      id: 'mgr-1',
      email: 'mgr@acme.com',
      fullName: 'Manager',
      role: 'BUILDING_MANAGER' as any,
      roles: ['BUILDING_MANAGER' as any],
      isRecoveryAdmin: false,
      buildingScopeIds: ['bldg-1']
    };

    await controller.createDesk(
      'flr-4',
      {
        code: 'D-03',
        label: 'Manager Desk',
        deskType: DeskType.STANDARD,
        xCoordinatePct: 20,
        yCoordinatePct: 20
      },
      managerUser
    );

    expect(service.createDesk).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'D-03', floorId: 'flr-4' }),
      managerUser
    );
  });

  it('should pass authenticated user context to deleteDesk and deleteFloor', async () => {
    service.deleteDesk = jest.fn().mockResolvedValue(undefined);
    service.deleteFloor = jest.fn().mockResolvedValue(undefined);

    const managerUser = {
      id: 'mgr-1',
      email: 'mgr@acme.com',
      fullName: 'Manager',
      role: 'BUILDING_MANAGER' as any,
      roles: ['BUILDING_MANAGER' as any],
      isRecoveryAdmin: false,
      buildingScopeIds: ['bldg-1']
    };

    await controller.deleteDesk('desk-1', managerUser);
    expect(service.deleteDesk).toHaveBeenCalledWith('desk-1', managerUser);

    await controller.deleteFloor('flr-4', managerUser);
    expect(service.deleteFloor).toHaveBeenCalledWith('flr-4', managerUser);
  });
});

