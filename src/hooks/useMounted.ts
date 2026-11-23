'use client';

import { useSyncExternalStore } from 'react';

// Stable subscribe: the "mounted" signal never changes after hydration,
// so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * True once the component has mounted on the client, false during SSR.
 *
 * This is the React-endorsed replacement for the
 * `useState(false) + useEffect(() => setMounted(true), [])` pattern,
 * which the react-hooks v6 compiler rules reject
 * (`set-state-in-effect`): the server snapshot (false) is used for the
 * hydration render — so there is no hydration mismatch — and the
 * client snapshot (true) applies immediately after, with no effect
 * and no extra render pass. EGM E4.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
