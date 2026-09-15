import { useCallback, useEffect, useRef, useState } from 'react';
import { sendRequest } from '../platform/messages';
import type { Request, Snapshot } from '../shared/types';

export function useWebStats() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);
  const mutations = useRef(0);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);

  const run = useCallback((request: Request): Promise<boolean> => {
    if (request.type === 'snapshot' && pending.current > 0) return Promise.resolve(true);
    pending.current++;
    if (request.type !== 'snapshot') { mutations.current++; setBusy(true); }
    const result = tail.current.then(async () => {
      try {
        const snapshot = await sendRequest(request);
        if (mounted.current) { setSnapshot(snapshot); setError(null); }
        return true;
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : 'WebStats could not load your data. Please retry.');
        return false;
      } finally {
        pending.current--;
        if (request.type !== 'snapshot') mutations.current--;
        if (mounted.current) setBusy(mutations.current > 0);
      }
    });
    tail.current = result;
    return result;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const refresh = async () => {
      if (!document.hidden) await run({ type: 'snapshot' });
      if (active) timer = setTimeout(() => { void refresh(); }, 2_000);
    };
    void refresh();
    return () => { active = false; mounted.current = false; clearTimeout(timer); };
  }, [run]);

  return { snapshot, error, busy, run };
}
