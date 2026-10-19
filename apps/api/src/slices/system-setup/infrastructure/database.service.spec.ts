import { DatabaseService } from './database.service.js';

describe('DatabaseService.runPendingMigrations', () => {
  const createService = (query: jest.Mock) => {
    const client = {
      query,
      release: jest.fn()
    };
    const service = new DatabaseService();
    Object.defineProperty(service, 'pool', {
      configurable: true,
      value: {
        connect: jest.fn().mockResolvedValue(client)
      }
    });

    return { service, client };
  };

  it('skips migrations when no application tables exist yet', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const { service, client } = createService(query);

    await expect(service.runPendingMigrations()).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('fails startup when migration fails for an existing application schema', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ table_name: 'desks' }] };
      }
      if (sql.includes('ALTER TABLE users ADD COLUMN')) {
        throw new Error('relation "users" does not exist');
      }
      return { rows: [] };
    });
    const { service, client } = createService(query);

    await expect(service.runPendingMigrations()).rejects.toThrow(
      'CRITICAL: Database migration failed: relation "users" does not exist'
    );
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
