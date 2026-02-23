import { useRef, useCallback } from 'react';

export function useIMEComposing() {
  const composingRef = useRef(false);
  const onCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const onCompositionEnd = useCallback(() => { setTimeout(() => { composingRef.current = false; }, 0); }, []);
  const isComposing = useCallback((e: React.KeyboardEvent) => {
    return composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229;
  }, []);
  return { composingRef, onCompositionStart, onCompositionEnd, isComposing };
}
