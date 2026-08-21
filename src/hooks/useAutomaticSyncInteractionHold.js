import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

// Binds a scheduler hold to the lifetime of a financial editor. Cleanup is
// deliberately local to the component so a cancelled/closed modal cannot leave
// automatic sync deferred forever.
export const useAutomaticSyncInteractionHold = (active, reason) => {
  const acquire = useStore(state => state.acquireAutomaticSyncInteractionHold);
  const release = useStore(state => state.releaseAutomaticSyncInteractionHold);
  const tokenRef = useRef(null);

  useEffect(() => {
    if (!active) {
      if (tokenRef.current) release(tokenRef.current);
      tokenRef.current = null;
      return undefined;
    }
    const token = acquire(reason);
    tokenRef.current = token;
    return () => {
      release(token);
      if (tokenRef.current === token) tokenRef.current = null;
    };
  }, [active, reason, acquire, release]);
};
