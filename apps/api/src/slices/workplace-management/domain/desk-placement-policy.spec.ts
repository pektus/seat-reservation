import { DeskPlacementPolicy } from './desk-placement-policy.js';

describe('DeskPlacementPolicy (Domain Rules)', () => {
  it('should accept valid desk coordinates within 0 to 100 percent', () => {
    const result = DeskPlacementPolicy.validateCoordinates(45.5, 30.2);
    expect(result.isSuccess).toBe(true);
  });

  it('should accept boundary desk coordinates at 0% and 100%', () => {
    expect(DeskPlacementPolicy.validateCoordinates(0, 0).isSuccess).toBe(true);
    expect(DeskPlacementPolicy.validateCoordinates(100, 100).isSuccess).toBe(true);
  });

  it('should reject coordinates less than 0%', () => {
    const result = DeskPlacementPolicy.validateCoordinates(-1.5, 50);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Coordinates must be between 0 and 100 percent');
  });

  it('should reject coordinates exceeding 100%', () => {
    const result = DeskPlacementPolicy.validateCoordinates(50, 100.5);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Coordinates must be between 0 and 100 percent');
  });

  it('should validate allowed floor plan image MIME types (PNG and JPEG)', () => {
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('image/png')).toBe(true);
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('image/jpeg')).toBe(true);
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('image/jpg')).toBe(true);
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('image/svg+xml')).toBe(true);
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('application/pdf')).toBe(false);
    expect(DeskPlacementPolicy.isAllowedFloorPlanMimeType('application/x-cad')).toBe(false);
  });

  it('should validate desk code format', () => {
    expect(DeskPlacementPolicy.validateDeskCode('D-01').isSuccess).toBe(true);
    expect(DeskPlacementPolicy.validateDeskCode('   ').isFailure).toBe(true);
  });
});

