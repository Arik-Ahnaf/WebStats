import { browser } from 'wxt/browser';
import type { Request, Response, Snapshot } from '../shared/types';

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'snapshot' || value.type === 'complete-onboarding') return true;
  if (value.type === 'delete-statistics') return 'confirmed' in value && value.confirmed === true;
  if (value.type !== 'settings' || !('settings' in value) || !value.settings || typeof value.settings !== 'object') return false;
  const settings = value.settings as Record<string, unknown>;
  return ['generateCharts', 'weekly', 'monthly'].every(key => typeof settings[key] === 'boolean');
}

export async function sendRequest(request: Request): Promise<Snapshot> {
  const response: Response | undefined = await browser.runtime.sendMessage(request);
  if (!response) throw new Error('WebStats could not reach its background worker. Reopen the extension to retry.');
  if (!response.ok) throw new Error(response.error);
  return response.snapshot;
}
