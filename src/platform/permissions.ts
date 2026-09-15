import { browser } from 'wxt/browser';
import { permissionPolicy } from '../shared/permission-policy';

export const TRACKING_PERMISSIONS = permissionPolicy(import.meta.env.BROWSER).optional;

export function hasTrackingPermissions(): Promise<boolean> {
  return browser.permissions.contains({ permissions: TRACKING_PERMISSIONS });
}

/** Call directly from the Start click handler, before any await. */
export function requestTrackingPermissions(): Promise<boolean> {
  return browser.permissions.request({ permissions: TRACKING_PERMISSIONS });
}
