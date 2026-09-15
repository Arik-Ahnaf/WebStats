import { browser } from 'wxt/browser';

export const TRACKING_PERMISSIONS: ('tabs' | 'idle' | 'alarms' | 'storage')[] = ['tabs', 'idle', 'alarms', 'storage'];

export function hasTrackingPermissions(): Promise<boolean> {
  return browser.permissions.contains({ permissions: TRACKING_PERMISSIONS });
}

/** Call directly from the Start click handler, before any await. */
export function requestTrackingPermissions(): Promise<boolean> {
  return browser.permissions.request({ permissions: TRACKING_PERMISSIONS });
}
