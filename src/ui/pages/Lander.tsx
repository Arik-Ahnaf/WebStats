import { useState } from 'react';
import { requestTrackingPermissions } from '../../platform/permissions';
import { Button } from '../components/primitives';

export function Lander({ onStart, revoked }: { onStart: () => Promise<boolean>; revoked: boolean }) {
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // This is deliberately the first asynchronous operation in the user gesture.
    const permission = requestTrackingPermissions();
    setPending(true);
    setError(null);
    try {
      const granted = await permission;
      setDenied(!granted);
      if (granted && !await onStart()) setError('Setup could not finish. Please try again.');
    } catch {
      setError('Access could not be requested. Please try again.');
    } finally { setPending(false); }
  }

  return <main className="lander" aria-labelledby="welcome-title">
    <section className="lander-brand">
      <img src="/assets/logo.svg" className="lander-logo" alt="WebStats spider-web clock" width="110" height="110" />
      <h1 id="welcome-title">Welcome to WebStats</h1>
      <p>The addon that keeps track of how<br className="wide-break" /> much time you spend on the web</p>
    </section>
    <section className="lander-start">
      <p className="permission-description">Allow tab and idle access to measure active browsing.<br />Your website times stay on this device.</p>
      {(denied || revoked || error) && <p className="onboarding-error" role="alert">
        {error ?? (denied ? 'Access wasn’t granted. Tracking is off; you can try again.' : 'Tracking access was removed. Start again to resume.')}
      </p>}
      <Button className="start-button" disabled={pending} onClick={() => { void start(); }}>
        {pending ? 'Starting…' : denied || error ? 'Try again' : 'Start'}
      </Button>
      <span className="privacy-caption">No account. No uploads. Just your time.</span>
    </section>
  </main>;
}
