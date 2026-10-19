import { ApiClient } from './client.js';
import {
  SetupStatusResponse,
  DatabaseConnectionConfig,
  DatabaseTestResultDto,
  SetupInitialConfigRequest
} from '@seat-reservation/contracts';

export class SetupApi {
  public static getStatus(): Promise<SetupStatusResponse> {
    return ApiClient.get<SetupStatusResponse>('/setup/status');
  }

  public static testDatabase(config: DatabaseConnectionConfig): Promise<DatabaseTestResultDto> {
    return ApiClient.post<DatabaseTestResultDto>('/setup/database/test', config);
  }

  public static initializeSystem(config: SetupInitialConfigRequest): Promise<SetupStatusResponse> {
    return ApiClient.post<SetupStatusResponse>('/setup/initialize', config);
  }
}

