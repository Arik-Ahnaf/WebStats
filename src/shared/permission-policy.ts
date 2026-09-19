export type ExtensionPermission = 'tabs' | 'idle' | 'alarms' | 'storage' | 'favicon';

/** Firefox does not accept alarms/storage in optional_permissions. */
export function permissionPolicy(browser: string | undefined): {
  required: ExtensionPermission[]; optional: ExtensionPermission[]; tracking: ExtensionPermission[];
} {
  return browser === 'firefox'
    ? { required: ['alarms', 'storage'], optional: ['tabs', 'idle'], tracking: ['tabs', 'idle'] }
    : {
      required: [],
      optional: ['tabs', 'idle', 'alarms', 'storage', 'favicon'],
      tracking: ['tabs', 'idle', 'alarms', 'storage'],
    };
}
