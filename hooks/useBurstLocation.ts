import { useCallback, useRef, useState } from 'react';
import { getBurstPosition, startGpsWarmup, stopGpsWarmup, type BurstPosition } from '../services/golfBurstLocation';

type BurstLocationStatus = 'idle' | 'loading' | 'success' | 'error';
type BurstLocationError = 'denied' | 'timeout' | 'unsupported';

export function useBurstLocation() {
  const [status, setStatus] = useState<BurstLocationStatus>('idle');
  const [position, setPosition] = useState<BurstPosition | null>(null);
  const [weakSignal, setWeakSignal] = useState(false);
  const [error, setError] = useState<BurstLocationError | null>(null);
  // Descarta la respuesta de un pedido viejo si el usuario volvio a apretar
  // el boton antes de que terminara el burst anterior.
  const requestIdRef = useRef(0);

  const request = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    const result = await getBurstPosition();
    if (requestIdRef.current !== requestId) return;

    if (result.status === 'ok') {
      setPosition(result.position);
      setWeakSignal(result.weakSignal);
      setStatus('success');
    } else {
      setError(result.status);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setStatus('idle');
    setPosition(null);
    setWeakSignal(false);
    setError(null);
  }, []);

  return { status, position, weakSignal, error, request, reset, startWarmup: startGpsWarmup, stopWarmup: stopGpsWarmup };
}
