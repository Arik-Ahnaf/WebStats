import { useState } from 'react';
import { Navigation, Button } from './components/primitives';
import type { Page } from './components/primitives';
import { useWebStats } from './useWebStats';
import { Lander } from './pages/Lander';
import { Home } from './pages/Home';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { useSiteFavicons } from './useSiteFavicons';

export function App() {
  const { snapshot, error, busy, run } = useWebStats();
  const [page, setPage] = useState<Page>('home');
  const favicons = useSiteFavicons(snapshot?.permissionGranted ?? false);
  if (!snapshot) return <div className="app-shell centered-state">
    <img src="/assets/logo.svg" alt="WebStats" width="70" height="70" />
    <h1>WebStats</h1>
    {error ? <><p role="alert">{error}</p><Button onClick={() => { void run({ type: 'snapshot' }); }}>Try again</Button></>
      : <p role="status">Loading your time…</p>}
  </div>;

  return <div className="app-shell">
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { void run({ type: 'snapshot' }); }}>Retry</button></div>}
    {!snapshot.preferences.onboarded || !snapshot.permissionGranted
      ? <Lander revoked={snapshot.preferences.onboarded && !snapshot.permissionGranted} onStart={() => run({ type: 'complete-onboarding' })} />
      : <>
        {page === 'home' && <Home snapshot={snapshot} stale={!!error} favicons={favicons} />}
        {page === 'reports' && <Reports snapshot={snapshot} busy={busy} favicons={favicons}
          onSettings={() => setPage('settings')} onDelete={() => run({ type: 'delete-statistics', confirmed: true })} />}
        {page === 'settings' && <Settings preferences={snapshot.preferences} busy={busy}
          onChange={settings => { void run({ type: 'settings', settings }); }} />}
        <Navigation page={page} onChange={setPage} />
      </>}
  </div>;
}
