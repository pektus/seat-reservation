import { ReservationStatus } from './enums.js';

export interface CreateReservationRequest {
  deskId: string;
  reservationDate: string; // ISO 8601 YYYY-MM-DD
  isGuest?: boolean;
  guestName?: string;
  guestEmail?: string;
  notes?: string;
}

export interface ReservationDto {
  id: string;
  deskId: string;
  deskCode: string;
  deskLabel: string;
  floorId: string;
  floorName: string;
  buildingName: string;
  reservedByUserId: string;
  reservedByName: string;
  reservationDate: string;
  status: ReservationStatus;
  isGuest: boolean;
  guestName?: string;
  guestEmail?: string;
  createdAt: string;
  cancelledAt?: string;
}

export interface FloorAvailabilityQuery {
  floorId: string;
  date: string; // YYYY-MM-DD
  floorPlanId?: string;
}

export interface FloorAvailabilityResponse {
  floorId: string;
  floorPlanId?: string;
  date: string;
  totalDesks: number;
  availableDesks: number;
  reservedDesks: number;
  desks: Array<{
    id: string;
    floorPlanId?: string;
    code: string;
    label: string;
    deskType: string;
    xCoordinatePct: number;
    yCoordinatePct: number;
    isAvailable: boolean;
    isReservedByCurrentUser: boolean;
    needsPositionReview: boolean;
    reservationId?: string;
    bookedFor?: string;
  }>;
}

