export type TrackingPermission = 'tabs' | 'idle' | 'alarms' | 'storage';

/** Firefox does not accept alarms/storage in optional_permissions. */
export function permissionPolicy(browser: string | undefined): {
  required: TrackingPermission[]; optional: TrackingPermission[];
} {
  return browser === 'firefox'
    ? { required: ['alarms', 'storage'], optional: ['tabs', 'idle'] }
    : { required: [], optional: ['tabs', 'idle', 'alarms', 'storage'] };
}
