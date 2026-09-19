import { browser } from 'wxt/browser';
import { permissionPolicy } from '../shared/permission-policy';

const policy = permissionPolicy(import.meta.env.BROWSER);
export const TRACKING_PERMISSIONS = policy.tracking;
export const ONBOARDING_PERMISSIONS = policy.optional;

export function hasTrackingPermissions(): Promise<boolean> {
  return browser.permissions.contains({ permissions: TRACKING_PERMISSIONS });
}

/** Call directly from the Start click handler, before any await. */
export function requestTrackingPermissions(): Promise<boolean> {
  return browser.permissions.request({ permissions: ONBOARDING_PERMISSIONS });
}
