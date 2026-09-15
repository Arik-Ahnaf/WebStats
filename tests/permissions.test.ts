import { afterEach, describe, expect, it, vi } from 'vitest';
import { permissionPolicy } from '../src/shared/permission-policy';

const mocks = vi.hoisted(() => ({ contains: vi.fn(), request: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { permissions: mocks } }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

describe('browser-specific permission onboarding', () => {
  it('declares Firefox-only installation permissions without site access', () => {
    expect(permissionPolicy('firefox')).toEqual({ required: ['alarms', 'storage'], optional: ['tabs', 'idle'] });
    expect(permissionPolicy('chrome').required).toEqual([]);
  });

  it.each(['firefox', 'chrome'])('requests only the declared optional permissions directly on %s', async target => {
    vi.stubEnv('BROWSER', target);
    const { hasTrackingPermissions, requestTrackingPermissions } = await import('../src/platform/permissions');
    const expected = { permissions: permissionPolicy(target).optional };
    mocks.contains.mockResolvedValue(false);
    expect(await hasTrackingPermissions()).toBe(false);
    mocks.request.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const denied = requestTrackingPermissions();
    // The request must happen synchronously, while the Start gesture is active.
    expect(mocks.request).toHaveBeenCalledWith(expected);
    expect(await denied).toBe(false);
    expect(await requestTrackingPermissions()).toBe(true);
    mocks.contains.mockResolvedValue(true);
    expect(await hasTrackingPermissions()).toBe(true);
    expect(mocks.contains).toHaveBeenCalledWith(expected);
  });
});
