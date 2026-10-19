import { DemoSeederService } from './demo-seeder.service.js';
import { DatabaseService } from '../../system-setup/infrastructure/database.service.js';

describe('DemoSeederService (Unit Spec)', () => {
  let service: DemoSeederService;
  let databaseService: Partial<DatabaseService>;

  beforeEach(() => {
    const mockClient = {
      query: jest.fn().mockImplementation((text: string) => {
        if (text.includes('SELECT id FROM companies WHERE name = $1')) {
          return Promise.resolve({ rows: [{ id: 'demo-comp-id' }] });
        }
        if (text.includes('SELECT id FROM buildings WHERE company_id = $1')) {
          return Promise.resolve({ rows: [{ id: 'demo-bldg-id' }] });
        }
        if (text.includes('SELECT id FROM floors WHERE building_id = $1')) {
          return Promise.resolve({ rows: [{ id: 'demo-flr-id' }] });
        }
        if (text.includes('COUNT(*) as total_desks')) {
          return Promise.resolve({ rows: [{ total_desks: 12 }] });
        }
        return Promise.resolve({ rows: [{ id: 'mock-id' }] });
      }),
      release: jest.fn()
    };

    databaseService = {
      initializeSchema: jest.fn().mockResolvedValue(undefined),
      getPool: jest.fn().mockReturnValue({
        connect: jest.fn().mockResolvedValue(mockClient)
      }) as any,
      query: jest.fn().mockImplementation((text: string, params: any[]) => {
        if (text.includes('UPDATE reservations') && text.includes('CANCELLED')) {
          return Promise.resolve({ rowCount: 4, rows: [] });
        }
        if (text.includes('COUNT(*) as total_desks')) {
          return Promise.resolve({ rows: [{ total_desks: 12 }] });
        }
        return Promise.resolve({ rows: [{ id: 'mock-id' }] });
      })
    };

    service = new DemoSeederService(databaseService as DatabaseService);
  });

  it('should seed demo workplace and return seeded metadata', async () => {
    const res = await service.seedDemoData();

    expect(res.success).toBe(true);
    expect(res.demoCompany.name).toContain('Acme');
    expect(res.demoFloor.desksCount).toBe(12);
  });

  it('should reset demo sandbox reservations', async () => {
    const res = await service.resetDemoData();

    expect(res.success).toBe(true);
    expect(res.clearedReservationsCount).toBe(4);
    expect(res.message).toContain('reset');
  });
});

