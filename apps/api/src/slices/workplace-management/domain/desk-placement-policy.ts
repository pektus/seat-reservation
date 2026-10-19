import { Result } from '../../../common/result.js';

export class DeskPlacementPolicy {
  private static readonly ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/svg+xml',
    'image/svg',
    'image/webp'
  ]);

  public static validateCoordinates(xPct: number, yPct: number): Result<void> {
    if (typeof xPct !== 'number' || typeof yPct !== 'number' || isNaN(xPct) || isNaN(yPct)) {
      return Result.fail('Coordinates must be valid numbers');
    }

    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) {
      return Result.fail('Coordinates must be between 0 and 100 percent');
    }

    return Result.ok();
  }

  public static isAllowedFloorPlanMimeType(mimeType: string): boolean {
    if (!mimeType) return false;
    const cleanType = mimeType.split(';')[0].toLowerCase().trim();
    return this.ALLOWED_MIME_TYPES.has(cleanType);
  }

  public static validateDeskCode(code: string): Result<void> {
    if (!code || code.trim().length === 0) {
      return Result.fail('Desk code cannot be empty');
    }

    if (code.trim().length > 50) {
      return Result.fail('Desk code cannot exceed 50 characters');
    }

    return Result.ok();
  }
}

