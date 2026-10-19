import { ApiClient } from './client.js';
import {
  BuildingDto,
  FloorDto,
  FloorPlanDto,
  DeskDto,
  CreateDeskRequest,
  UpdateDeskCoordinatesRequest
} from '@seat-reservation/contracts';

export class WorkplaceApi {
  public static listCompanies(): Promise<{ id: string; name: string }[]> {
    return ApiClient.get<{ id: string; name: string }[]>('/workplace/companies');
  }

  public static createCompany(name: string): Promise<{ id: string; name: string }> {
    return ApiClient.post<{ id: string; name: string }>('/workplace/companies', { name });
  }

  public static listBuildings(): Promise<BuildingDto[]> {
    return ApiClient.get<BuildingDto[]>('/workplace/buildings');
  }

  public static createBuilding(building: { companyId: string; name: string; address?: string; timezone?: string }): Promise<BuildingDto> {
    return ApiClient.post<BuildingDto>('/workplace/buildings', building);
  }

  public static deleteBuilding(buildingId: string): Promise<void> {
    return ApiClient.delete<void>(`/workplace/buildings/${buildingId}`);
  }

  public static listFloors(buildingId: string): Promise<FloorDto[]> {
    return ApiClient.get<FloorDto[]>(`/workplace/buildings/${buildingId}/floors`);
  }

  public static createFloor(buildingId: string, floor: { floorNumber: number; name: string }): Promise<FloorDto> {
    return ApiClient.post<FloorDto>(`/workplace/buildings/${buildingId}/floors`, floor);
  }

  public static deleteFloor(floorId: string): Promise<void> {
    return ApiClient.delete<void>(`/workplace/floors/${floorId}`);
  }

  public static uploadFloorPlan(floorId: string, plan: { filePath: string; mimeType: string; widthPx?: number; heightPx?: number }): Promise<FloorPlanDto> {
    return ApiClient.post<FloorPlanDto>(`/workplace/floors/${floorId}/floor-plan`, plan);
  }

  public static listFloorPlans(floorId: string): Promise<FloorPlanDto[]> {
    return ApiClient.get<FloorPlanDto[]>(`/workplace/floors/${floorId}/floor-plans`);
  }

  public static listFloorPlanLibrary(): Promise<FloorPlanDto[]> {
    return ApiClient.get<FloorPlanDto[]>(`/workplace/floor-plans/library`);
  }

  public static activateFloorPlan(floorId: string, planId: string): Promise<FloorPlanDto> {
    return ApiClient.post<FloorPlanDto>(`/workplace/floors/${floorId}/floor-plans/${planId}/activate`);
  }

  public static deleteFloorPlan(floorId: string, planId: string): Promise<void> {
    return ApiClient.delete<void>(`/workplace/floors/${floorId}/floor-plans/${planId}`);
  }

  public static listDesks(floorId: string, floorPlanId?: string): Promise<DeskDto[]> {
    const url = floorPlanId
      ? `/workplace/floors/${floorId}/desks?floorPlanId=${encodeURIComponent(floorPlanId)}`
      : `/workplace/floors/${floorId}/desks`;
    return ApiClient.get<DeskDto[]>(url);
  }

  public static createDesk(floorId: string, desk: Omit<CreateDeskRequest, 'floorId'>): Promise<DeskDto> {
    return ApiClient.post<DeskDto>(`/workplace/floors/${floorId}/desks`, desk);
  }

  public static updateCoordinates(deskId: string, coords: UpdateDeskCoordinatesRequest): Promise<DeskDto> {
    return ApiClient.patch<DeskDto>(`/workplace/desks/${deskId}/coordinates`, coords);
  }

  public static acknowledgeReview(deskId: string): Promise<DeskDto> {
    return ApiClient.post<DeskDto>(`/workplace/desks/${deskId}/acknowledge-review`);
  }

  public static deleteDesk(deskId: string): Promise<void> {
    return ApiClient.delete<void>(`/workplace/desks/${deskId}`);
  }

  public static purgeDemoData(): Promise<{ clearedCount: number }> {
    return ApiClient.post<{ clearedCount: number }>('/workplace/purge-demo-data');
  }
}

