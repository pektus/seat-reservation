import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';

export class FloorAvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  floorId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @IsString()
  @IsOptional()
  floorPlanId?: string;
}

