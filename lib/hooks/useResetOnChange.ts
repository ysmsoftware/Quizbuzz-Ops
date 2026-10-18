import { useState } from 'react';

/**
 * Runs `reset` (state setters only) during the render in which `key` changed — React's documented
 * replacement for `useEffect(() => setState(...), [key])`, which costs an extra committed render
 * with stale state on screen. `key` must be a primitive/string.
 */
export function useResetOnChange(key: string, reset: () => void) {
  const [prev, setPrev] = useState(key);
  if (prev !== key) {
    setPrev(key);
    reset();
  }
}
