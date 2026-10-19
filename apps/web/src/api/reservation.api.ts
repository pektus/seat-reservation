import { ApiClient } from './client.js';
import {
  ReservationDto,
  CreateReservationRequest,
  FloorAvailabilityResponse
} from '@seat-reservation/contracts';

export class ReservationApi {
  public static getFloorAvailability(floorId: string, date: string, floorPlanId?: string): Promise<FloorAvailabilityResponse> {
    const params = new URLSearchParams({ floorId, date });
    if (floorPlanId) {
      params.append('floorPlanId', floorPlanId);
    }
    return ApiClient.get<FloorAvailabilityResponse>(
      `/reservations/floor-availability?${params.toString()}`
    );
  }

  public static createReservation(request: CreateReservationRequest): Promise<ReservationDto> {
    return ApiClient.post<ReservationDto>('/reservations', request);
  }

  public static getMyReservations(): Promise<ReservationDto[]> {
    return ApiClient.get<ReservationDto[]>('/reservations/my-reservations');
  }

  public static cancelReservation(reservationId: string): Promise<ReservationDto> {
    return ApiClient.delete<ReservationDto>(`/reservations/${reservationId}`);
  }

  public static cancelReservationByDesk(deskId: string, date: string): Promise<ReservationDto> {
    return ApiClient.delete<ReservationDto>(`/reservations/desk/${encodeURIComponent(deskId)}?date=${encodeURIComponent(date)}`);
  }
}

