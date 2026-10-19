import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ReservationController } from './reservation.controller.js';
import { ReservationEngineService } from '../reservation-engine.service.js';
import { ReservationStatus, UserRole } from '@seat-reservation/contracts';
import { AuthenticatedUserPayload } from '../../identity-access/decorators/current-user.decorator.js';

describe('ReservationController (Integration Spec)', () => {
  let controller: ReservationController;
  let service: Partial<ReservationEngineService>;

  const mockUser: AuthenticatedUserPayload = {
    id: 'user-001',
    email: 'sarah@company.com',
    fullName: 'Sarah Connor',
    role: UserRole.EMPLOYEE,
    roles: [UserRole.EMPLOYEE],
    isRecoveryAdmin: false
  };

  beforeEach(async () => {
    service = {
      createReservation: jest.fn().mockImplementation((user, dto) => {
        if (dto.deskId === 'desk-already-booked') {
          throw new ConflictException('This desk is already reserved for the selected date.');
        }
        return Promise.resolve({
          id: 'res-101',
          deskId: dto.deskId,
          deskCode: 'D-01',
          deskLabel: 'Window Desk 1',
          floorId: 'flr-4',
          floorName: 'Floor 4',
          buildingName: 'Main Campus',
          reservedByUserId: user.id,
          reservedByName: user.fullName,
          reservationDate: dto.reservationDate,
          status: ReservationStatus.CONFIRMED,
          isGuest: Boolean(dto.isGuest),
          guestName: dto.guestName,
          guestEmail: dto.guestEmail,
          createdAt: new Date().toISOString()
        });
      }),
      getFloorAvailability: jest.fn().mockResolvedValue({
        floorId: 'flr-4',
        date: '2026-10-20',
        totalDesks: 2,
        availableDesks: 1,
        reservedDesks: 1,
        desks: [
          { id: 'desk-1', code: 'D-01', label: 'Desk 1', isAvailable: true },
          { id: 'desk-2', code: 'D-02', label: 'Desk 2', isAvailable: false }
        ]
      }),
      getUserReservations: jest.fn().mockResolvedValue([
        {
          id: 'res-101',
          deskCode: 'D-01',
          reservationDate: '2026-10-20',
          status: ReservationStatus.CONFIRMED
        }
      ]),
      cancelReservation: jest.fn().mockResolvedValue({
        id: 'res-101',
        status: ReservationStatus.CANCELLED,
        cancelledAt: new Date().toISOString()
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReservationController],
      providers: [
        { provide: ReservationEngineService, useValue: service }
      ]
    }).compile();

    controller = module.get<ReservationController>(ReservationController);
  });

  it('should create personal reservation successfully', async () => {
    const res = await controller.createReservation(mockUser, {
      deskId: 'desk-available',
      reservationDate: '2026-10-20'
    });

    expect(res.id).toBe('res-101');
    expect(res.isGuest).toBe(false);
    expect(service.createReservation).toHaveBeenCalled();
  });

  it('should create guest proxy reservation with visitor metadata', async () => {
    const res = await controller.createReservation(mockUser, {
      deskId: 'desk-available',
      reservationDate: '2026-10-20',
      isGuest: true,
      guestName: 'Alex Visitor',
      guestEmail: 'alex@client.com'
    });

    expect(res.isGuest).toBe(true);
    expect(res.guestName).toBe('Alex Visitor');
    expect(res.reservedByUserId).toBe(mockUser.id);
  });

  it('should throw ConflictException on concurrent double booking', async () => {
    await expect(
      controller.createReservation(mockUser, {
        deskId: 'desk-already-booked',
        reservationDate: '2026-10-20'
      })
    ).rejects.toThrow(ConflictException);
  });

  it('should retrieve floor availability with desk statuses', async () => {
    const availability = await controller.getFloorAvailability({
      floorId: 'flr-4',
      date: '2026-10-20'
    });

    expect(availability.totalDesks).toBe(2);
    expect(availability.availableDesks).toBe(1);
    expect(availability.reservedDesks).toBe(1);
  });

  it('should cancel active reservation', async () => {
    const cancelled = await controller.cancelReservation('res-101', mockUser);
    expect(cancelled.status).toBe(ReservationStatus.CANCELLED);
    expect(service.cancelReservation).toHaveBeenCalledWith('res-101', mockUser);
  });
});

