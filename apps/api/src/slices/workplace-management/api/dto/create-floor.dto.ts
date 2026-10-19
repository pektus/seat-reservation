import { IsString, IsNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFloorBodyDto {
  @Type(() => Number)
  @IsInt()
  floorNumber!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateFloorDto {
  @IsString()
  @IsNotEmpty()
  buildingId!: string;

  @Type(() => Number)
  @IsInt()
  floorNumber!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;
}


