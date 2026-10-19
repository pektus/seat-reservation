import { DeskType, DeskAvailabilityStatus } from './enums.js';

export interface CompanyDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface BuildingDto {
  id: string;
  companyId: string;
  name: string;
  address: string;
  timezone: string;
}

export interface FloorDto {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  activeFloorPlanId?: string;
  activeFloorPlanPath?: string;
}

export interface FloorPlanDto {
  id: string;
  floorId: string;
  filePath: string;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  version: number;
  isActive: boolean;
  uploadedAt: string;
}

export interface DeskDto {
  id: string;
  floorId: string;
  floorPlanId?: string;
  code: string;
  label: string;
  deskType: DeskType;
  xCoordinatePct: number;
  yCoordinatePct: number;
  isActive: boolean;
  needsPositionReview: boolean;
  amenities?: string[];
}

export interface DeskWithAvailabilityDto extends DeskDto {
  availabilityStatus: DeskAvailabilityStatus;
  currentReservation?: {
    id: string;
    reservedByName: string;
    isGuest: boolean;
    guestName?: string;
  };
}

export interface CreateDeskRequest {
  floorId: string;
  floorPlanId?: string;
  code: string;
  label: string;
  deskType: DeskType;
  xCoordinatePct: number;
  yCoordinatePct: number;
  amenities?: string[];
}

export interface UpdateDeskCoordinatesRequest {
  xCoordinatePct: number;
  yCoordinatePct: number;
}

