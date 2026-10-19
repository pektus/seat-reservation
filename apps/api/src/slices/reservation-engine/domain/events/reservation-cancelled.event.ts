export class ReservationCancelledEvent {
  public static readonly EVENT_NAME = 'reservation.cancelled';

  constructor(
    public readonly reservationId: string,
    public readonly deskId: string,
    public readonly cancelledByUserId: string,
    public readonly reservationDate: string,
    public readonly cancelledAt: string = new Date().toISOString()
  ) {}
}

