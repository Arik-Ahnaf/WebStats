export interface UsageRecord {
  hostname: string;
  date: string;
  durationMs: number;
  visits: number;
}

export interface Site {
  hostname: string;
  tabId: number;
  windowId: number;
}

export interface TrackerState {
  site: Site | null;
  at: number;
  browserSession: string;
  worker: string;
  monotonic: number;
  timeZone: string;
}

export interface Observation extends TrackerState {
  reset?: boolean;
}

export interface Preferences {
  onboarded: boolean;
  generateCharts: boolean;
  weekly: boolean;
  monthly: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  onboarded: false,
  generateCharts: true,
  weekly: true,
  monthly: true,
};

export type Period = 'week' | 'month';
export type TrackingStatus = 'active' | 'unfocused' | 'idle' | 'unsupported' | 'permission' | 'setup';

export interface Snapshot {
  preferences: Preferences;
  permissionGranted: boolean;
  currentSite: Site | null;
  status: TrackingStatus;
  records: UsageRecord[];
  now: number;
}

export type Request =
  | { type: 'snapshot' }
  | { type: 'complete-onboarding' }
  | { type: 'settings'; settings: Pick<Preferences, 'generateCharts' | 'weekly' | 'monthly'> }
  | { type: 'delete-statistics'; confirmed: true };

export type Response = { ok: true; snapshot: Snapshot } | { ok: false; error: string };
