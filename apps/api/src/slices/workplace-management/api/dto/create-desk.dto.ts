import { IsString, IsNotEmpty, IsNumber, Min, Max, IsEnum, IsOptional, IsArray } from 'class-validator';
import { DeskType } from '@seat-reservation/contracts';

export class CreateDeskDto {
  @IsString()
  @IsNotEmpty()
  floorId!: string;

  @IsString()
  @IsOptional()
  floorPlanId?: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsEnum(DeskType)
  @IsOptional()
  deskType: DeskType = DeskType.STANDARD;

  @IsNumber()
  @Min(0)
  @Max(100)
  xCoordinatePct!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  yCoordinatePct!: number;

  @IsArray()
  @IsOptional()
  amenities?: string[];
}

