import { Component } from 'react';
import type { ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return <main className="app-shell centered-state">
      <img src="/assets/logo.svg" alt="WebStats" width="64" height="64" />
      <h1>Let’s try that again</h1><p>WebStats couldn’t display this page. Your saved statistics are still on this device.</p>
      <button className="button" onClick={() => location.reload()}>Reload WebStats</button>
    </main>;
    return this.props.children;
  }
}
