import { useEffect, useRef } from 'react';
import { backStack } from '../backNavigation';

export function useBackHandler(enabled, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    return backStack.register(() => handlerRef.current());
  }, [enabled]);
}
