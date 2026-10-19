import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import {
  ReservationDto,
  FloorAvailabilityResponse
} from '@seat-reservation/contracts';
import { ReservationEngineService } from '../reservation-engine.service.js';
import { JwtAuthGuard } from '../../identity-access/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../identity-access/guards/optional-jwt-auth.guard.js';
import { CurrentUser, AuthenticatedUserPayload } from '../../identity-access/decorators/current-user.decorator.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { FloorAvailabilityQueryDto } from './dto/floor-availability.dto.js';

@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationEngineService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createReservation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateReservationDto
  ): Promise<ReservationDto> {
    return this.reservationService.createReservation(user, dto);
  }

  @Get('floor-availability')
  @UseGuards(OptionalJwtAuthGuard)
  async getFloorAvailability(
    @Query() query: FloorAvailabilityQueryDto,
    @CurrentUser() user?: AuthenticatedUserPayload
  ): Promise<FloorAvailabilityResponse> {
    return this.reservationService.getFloorAvailability(
      query.floorId,
      query.date,
      user,
      query.floorPlanId
    );
  }

  @Get('my-reservations')
  @UseGuards(JwtAuthGuard)
  async getMyReservations(
    @CurrentUser('id') userId: string
  ): Promise<ReservationDto[]> {
    return this.reservationService.getUserReservations(userId);
  }

  @Delete('desk/:deskId')
  @UseGuards(JwtAuthGuard)
  async cancelReservationByDesk(
    @Param('deskId') deskId: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthenticatedUserPayload
  ): Promise<ReservationDto> {
    if (!date) {
      throw new BadRequestException('Date query parameter is required');
    }
    return this.reservationService.cancelReservationByDesk(deskId, date, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async cancelReservation(
    @Param('id') reservationId: string,
    @CurrentUser() user: AuthenticatedUserPayload
  ): Promise<ReservationDto> {
    return this.reservationService.cancelReservation(reservationId, user);
  }
}

