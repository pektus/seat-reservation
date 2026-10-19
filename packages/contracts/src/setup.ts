import { AuthProviderType } from './enums.js';

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

export interface SetupInitialConfigRequest {
  database: DatabaseConnectionConfig;
  recoveryAdmin: {
    email: string;
    fullName: string;
    password: string;
  };
  authProvider: {
    type: AuthProviderType;
    metadataUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
  companyName: string;
}

export interface SetupStatusResponse {
  isSetupCompleted: boolean;
  setupLockedAt?: string;
  authProviderType?: AuthProviderType;
  installedVersion: string;
}

export interface DatabaseTestResultDto {
  success: boolean;
  latencyMs?: number;
  message?: string;
}

