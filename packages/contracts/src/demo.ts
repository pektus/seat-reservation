export interface SeedDemoDataResponse {
  success: boolean;
  message: string;
  demoCompany: {
    id: string;
    name: string;
  };
  demoBuilding: {
    id: string;
    name: string;
  };
  demoFloor: {
    id: string;
    name: string;
    desksCount: number;
  };
  demoSampleDate: string; // ISO date string for demo
}

export interface ResetDemoDataResponse {
  success: boolean;
  clearedReservationsCount: number;
  message: string;
}

