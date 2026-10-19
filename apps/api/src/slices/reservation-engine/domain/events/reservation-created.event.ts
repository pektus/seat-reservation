export class ReservationCreatedEvent {
  public static readonly EVENT_NAME = 'reservation.created';

  constructor(
    public readonly reservationId: string,
    public readonly deskId: string,
    public readonly reservedByUserId: string,
    public readonly reservationDate: string,
    public readonly isGuest: boolean,
    public readonly guestName?: string,
    public readonly createdAt: string = new Date().toISOString()
  ) {}
}

