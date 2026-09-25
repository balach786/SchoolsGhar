import { useEffect } from 'react';

/**
 * Runs an effect exactly once on mount (for initial data loads that should
 * not re-run on every render).
 */
export function useEffectOnce(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
