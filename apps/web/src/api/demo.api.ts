import { ApiClient } from './client.js';
import { SeedDemoDataResponse, ResetDemoDataResponse } from '@seat-reservation/contracts';

export class DemoApi {
  public static seed(): Promise<SeedDemoDataResponse> {
    return ApiClient.post<SeedDemoDataResponse>('/demo/seed');
  }

  public static reset(): Promise<ResetDemoDataResponse> {
    return ApiClient.post<ResetDemoDataResponse>('/demo/reset');
  }
}

