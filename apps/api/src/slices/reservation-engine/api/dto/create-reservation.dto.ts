import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches } from 'class-validator';
import { CreateReservationRequest } from '@seat-reservation/contracts';

export class CreateReservationDto implements CreateReservationRequest {
  @IsString()
  @IsNotEmpty()
  deskId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'reservationDate must be in YYYY-MM-DD format' })
  reservationDate!: string;

  @IsBoolean()
  @IsOptional()
  isGuest?: boolean;

  @IsString()
  @IsOptional()
  guestName?: string;

  @IsString()
  @IsOptional()
  guestEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

