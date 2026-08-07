import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getLocationDeniedMessage } from '../../services/golfBurstLocation';
import type { useBurstLocation } from '../../hooks/useBurstLocation';
import type { BurstPosition } from '../../services/golfBurstLocation';

type Estrategia = {
  club_recomendado: string;
  objetivo: string;
  riesgo: string | null;
  tip: string;
};

type StrategyResponse = {
  cached: boolean;
  estrategia: Estrategia;
  distancia_objetivo_yd: number;
  senal_debil: boolean;
};

type AiStatus = 'idle' | 'loading' | 'success' | 'error';

type Props = {
  open: boolean;
  onClose: () => void;
  rondaId: string | undefined;
  hoyoId: number;
  numeroHoyo: number;
  burstLocation: ReturnType<typeof useBurstLocation>;
};

const HoleStrategyModal: React.FC<Props> = ({ open, onClose, rondaId, hoyoId, numeroHoyo, burstLocation }) => {
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiErrorMsg, setAiErrorMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<StrategyResponse | null>(null);
  const handledPositionRef = useRef<BurstPosition | null>(null);

  const fetchEstrategia = useCallback(
    async (pos: BurstPosition) => {
      if (!rondaId) {
        setAiStatus('error');
        setAiErrorMsg('No se encontró tu ronda activa.');
        return;
      }
      setAiStatus('loading');
      setAiErrorMsg(null);
      const { data, error } = await supabase.functions.invoke<StrategyResponse>('golf-strategy', {
        body: {
          ronda_id: rondaId,
          hoyo_id: hoyoId,
          posicion: { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy },
        },
      });

      if (error) {
        let message = 'No se pudo generar la estrategia. Intentá de nuevo.';
        const context = (error as { context?: Response }).context;
        if (context && typeof context.json === 'function') {
          try {
            const body = await context.json();
            if (body?.error?.message) message = body.error.message;
          } catch {
            // se queda con el mensaje generico
          }
        }
        setAiStatus('error');
        setAiErrorMsg(message);
        return;
      }

      setResultado(data ?? null);
      setAiStatus('success');
    },
    [rondaId, hoyoId],
  );

  // Al abrir el modal (o cambiar de hoyo con el modal abierto) pedimos
  // siempre una posicion nueva: el valor del feature es "el tiro de ahora".
  useEffect(() => {
    if (!open) return;
    handledPositionRef.current = null;
    setAiStatus('idle');
    setAiErrorMsg(null);
    setResultado(null);
    burstLocation.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoyoId]);

  // Cuando el burst de GPS termina bien, disparamos la llamada a la IA.
  // Se compara por referencia contra el ultimo position ya procesado para
  // no reprocesar en cada render mientras el modal sigue abierto.
  useEffect(() => {
    if (!open) return;
    if (burstLocation.status === 'success' && burstLocation.position && burstLocation.position !== handledPositionRef.current) {
      handledPositionRef.current = burstLocation.position;
      void fetchEstrategia(burstLocation.position);
    }
  }, [open, burstLocation.status, burstLocation.position, fetchEstrategia]);

  if (!open) return null;

  const gpsError =
    burstLocation.status === 'error'
      ? burstLocation.error === 'denied'
        ? getLocationDeniedMessage()
        : burstLocation.error === 'timeout'
          ? 'No se pudo obtener tu ubicación. Probá de nuevo.'
          : 'Tu navegador no soporta geolocalización.'
      : null;

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4a9c40]" style={{ fontVariationSettings: "'FILL' 1" }}>
              auto_awesome
            </span>
            <h2 className="font-display font-bold text-lg text-[#111813]">Estrategia · Hoyo {numeroHoyo}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="size-8 flex items-center justify-center rounded-full hover:bg-black/5 text-[#111813]"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Paso 1: ubicando al jugador */}
        {burstLocation.status !== 'error' && burstLocation.status !== 'success' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="material-symbols-outlined text-3xl text-[#4a9c40] animate-spin">sync</span>
            <p className="text-sm text-slate-500">Ubicando tu posición...</p>
          </div>
        )}

        {/* Error de GPS */}
        {burstLocation.status === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="material-symbols-outlined text-3xl text-red-500">location_off</span>
            <p className="text-sm text-slate-600">{gpsError}</p>
            <button
              onClick={() => burstLocation.request()}
              className="mt-1 px-5 py-2.5 bg-[#4a9c40] hover:bg-[#3d8b33] text-white font-display font-semibold text-sm rounded-xl transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Paso 2: generando la estrategia con IA */}
        {burstLocation.status === 'success' && (aiStatus === 'idle' || aiStatus === 'loading') && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="material-symbols-outlined text-3xl text-[#4a9c40] animate-spin">sync</span>
            <p className="text-sm text-slate-500">Generando tu estrategia...</p>
          </div>
        )}

        {/* Error de la IA */}
        {burstLocation.status === 'success' && aiStatus === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="material-symbols-outlined text-3xl text-red-500">error</span>
            <p className="text-sm text-slate-600">{aiErrorMsg}</p>
            <button
              onClick={() => burstLocation.position && fetchEstrategia(burstLocation.position)}
              className="mt-1 px-5 py-2.5 bg-[#4a9c40] hover:bg-[#3d8b33] text-white font-display font-semibold text-sm rounded-xl transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Resultado */}
        {burstLocation.status === 'success' && aiStatus === 'success' && resultado && (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-500">
              Estás a <span className="font-bold text-slate-800 tabular-nums">{resultado.distancia_objetivo_yd} yardas</span> del objetivo.
            </p>

            {resultado.senal_debil && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">
                Señal GPS débil: la distancia puede no ser exacta.
              </p>
            )}

            <div className="bg-[#4a9c40]/5 border border-[#4a9c40]/20 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Palo recomendado</p>
              <p className="font-display font-extrabold text-2xl text-[#111813]">{resultado.estrategia.club_recomendado}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Objetivo</p>
              <p className="text-sm text-slate-700 leading-relaxed">{resultado.estrategia.objetivo}</p>
            </div>

            {resultado.estrategia.riesgo && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">warning</span>
                <p className="text-sm text-amber-800 leading-relaxed">{resultado.estrategia.riesgo}</p>
              </div>
            )}

            <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
              <span className="material-symbols-outlined text-slate-500 text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                tips_and_updates
              </span>
              <p className="text-sm text-slate-600 leading-relaxed">{resultado.estrategia.tip}</p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-[#111813] hover:bg-black text-white font-display font-semibold text-sm rounded-xl transition-all"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HoleStrategyModal;
