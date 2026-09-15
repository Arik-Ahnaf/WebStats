import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Preferences } from '../../shared/types';
import { Checkbox } from '../components/primitives';

export function Settings({ preferences, onChange, busy }: {
  preferences: Preferences; onChange: (settings: Preferences) => void; busy: boolean;
}) {
  const [draft, setDraft] = useState(preferences);
  useEffect(() => { if (!busy) setDraft(preferences); }, [preferences, busy]);
  function change(next: Preferences) { setDraft(next); onChange(next); }
  return <main className="settings-page">
    <header className="settings-brand">
      <div className="brand-lockup"><img src="/assets/logo.svg" alt="" width="46" height="46" /><h1>WebStats</h1></div>
      <div className="brand-caption"><p>Keep track of your online presence</p><span>v{browser.runtime.getManifest().version}</span></div>
    </header>
    <section className="settings-controls" aria-label="Chart settings">
      <Checkbox checked={draft.generateCharts} disabled={busy}
        onChange={generateCharts => change({ ...draft, generateCharts })}>Generate charts</Checkbox>
      <div className="nested-settings">
        <Checkbox checked={draft.weekly} disabled={busy || !draft.generateCharts}
          onChange={weekly => change({ ...draft, weekly })}>Weekly</Checkbox>
        <Checkbox checked={draft.monthly} disabled={busy || !draft.generateCharts}
          onChange={monthly => change({ ...draft, monthly })}>Monthly</Checkbox>
      </div>
      <p className="settings-hint">View and download charts from Reports.<br />Your time is tracked whether charts are on or off.</p>
      <p className="saved-caption" role="status">{busy ? 'Saving…' : 'Settings saved on this device'}</p>
    </section>
  </main>;
}
