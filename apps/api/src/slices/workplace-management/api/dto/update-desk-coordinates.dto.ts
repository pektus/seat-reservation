import { IsNumber, Min, Max } from 'class-validator';

export class UpdateDeskCoordinatesDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  xCoordinatePct!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  yCoordinatePct!: number;
}

