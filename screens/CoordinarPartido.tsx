import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { toWhatsAppLink } from '../utils/whatsapp';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Franja = 'mañana' | 'tarde' | 'noche';
type Slot = { dia: number; franja: Franja };
type EstadoCoord = 'pendiente' | 'pactado' | 'manual';

type CoordinarPartidoState = {
  partido: {
    id: string;
    jugador1_id: string;
    jugador2_id: string;
    jornada: number;
    bracket_tipo?: string | null;
    stage_name?: string | null;
  };
  torneo: { id: number; title: string };
  rivalNombre: string;
  rivalWhatsapp: string | null;
  myWhatsapp: string | null;
};

// ─── Constantes ──────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const FRANJAS: { id: Franja; label: string; rango: string; inicio: string; fin: string }[] = [
  { id: 'mañana', label: 'Mañana', rango: '8 a 13hs',  inicio: '08:00', fin: '13:00' },
  { id: 'tarde',  label: 'Tarde',  rango: '13 a 17hs', inicio: '13:00', fin: '17:00' },
  { id: 'noche',  label: 'Noche',  rango: 'Desde 17hs', inicio: '17:00', fin: '22:00' },
];

// ─── Algoritmo ───────────────────────────────────────────────────────────────

function findFirstOverlap(slotsJ1: Slot[], slotsJ2: Slot[]): { dia: number; franja: Franja } | null {
  for (let dia = 0; dia <= 6; dia++) {
    for (const { id: franja } of FRANJAS) {
      const j1Has = slotsJ1.some(s => s.dia === dia && s.franja === franja);
      const j2Has = slotsJ2.some(s => s.dia === dia && s.franja === franja);
      if (j1Has && j2Has) return { dia, franja };
    }
  }
  return null;
}

// Devuelve el ISO timestamp de la próxima ocurrencia del día de semana dado (nunca hoy)
function nextOccurrenceOf(diaSemana: number, horaInicio: string): string {
  const now = new Date();
  // JS: 0=Dom, 1=Lun … 6=Sab → convertir a nuestro 0=Lun … 6=Dom
  const todayDow = (now.getDay() + 6) % 7;
  let daysAhead = (diaSemana - todayDow + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // siempre próxima semana, nunca hoy

  const date = new Date(now);
  date.setDate(now.getDate() + daysAhead);

  const [h, m] = horaInicio.split(':').map(Number);
  date.setHours(h, m, 0, 0);

  return date.toISOString();
}

// ─── WhatsApp SVG (reutilizado del resto de la app) ──────────────────────────

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'size-5 fill-current' }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

// ─── Subcomponente: grilla de disponibilidad ─────────────────────────────────

interface DisponibilidadGridProps {
  slots: Slot[];
  editable: boolean;
  onToggle?: (dia: number, franja: Franja) => void;
}

const DisponibilidadGrid: React.FC<DisponibilidadGridProps> = ({ slots, editable, onToggle }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-left py-1.5 px-2 text-gray-400 font-semibold w-20"></th>
          {FRANJAS.map(f => (
            <th key={f.id} className="py-1.5 px-1 text-center text-gray-500 font-semibold">
              <div>{f.label}</div>
              <div className="text-[10px] text-gray-400 font-normal">{f.rango}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {DIAS_SEMANA.map((dia, diaIdx) => (
          <tr key={diaIdx} className="border-t border-gray-50">
            <td className="py-2 px-2 text-gray-700 font-semibold">{dia}</td>
            {FRANJAS.map(f => {
              const active = slots.some(s => s.dia === diaIdx && s.franja === f.id);
              return (
                <td key={f.id} className="py-2 px-1 text-center">
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onToggle?.(diaIdx, f.id)}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                        active
                          ? 'bg-[#13ec49] text-[#111813] shadow-sm'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {active ? '✓' : '–'}
                    </button>
                  ) : (
                    <span
                      className={`inline-block w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                        active
                          ? 'bg-[#13ec49]/20 text-[#0eb538]'
                          : 'bg-gray-50 text-gray-300'
                      }`}
                    >
                      {active ? '✓' : '–'}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────

const CoordinarPartido: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CoordinarPartidoState | null;

  const [currentUserId, setCurrentUserId] = useState('');

  // Disponibilidad
  const [mySlots, setMySlots] = useState<Slot[]>([]);
  const [rivalSlots, setRivalSlots] = useState<Slot[]>([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [rivalSubmitted, setRivalSubmitted] = useState(false);

  // Editor
  const [editingSlots, setEditingSlots] = useState<Slot[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Estado de coordinación
  const [estadoCoord, setEstadoCoord] = useState<EstadoCoord>('pendiente');
  const [horarioPactado, setHorarioPactado] = useState<string | null>(null);

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overlap calculado
  const overlap = useMemo<{ dia: number; franja: Franja } | null>(() => {
    if (!mySubmitted || !rivalSubmitted) return null;
    return findFirstOverlap(mySlots, rivalSlots);
  }, [mySlots, rivalSlots, mySubmitted, rivalSubmitted]);

  // ── Cargar datos ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async (userId: string) => {
    if (!state?.partido?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [matchRes, dispRes] = await Promise.all([
        supabase
          .from('partidos')
          .select('estado_coordinacion, horario_pactado')
          .eq('id', state.partido.id)
          .maybeSingle(),
        supabase
          .from('partido_disponibilidad')
          .select('perfil_id, slots')
          .eq('partido_id', state.partido.id),
      ]);

      if (matchRes.data) {
        setEstadoCoord((matchRes.data as any).estado_coordinacion ?? 'pendiente');
        setHorarioPactado((matchRes.data as any).horario_pactado ?? null);
      }

      const rows = (dispRes.data ?? []) as { perfil_id: string; slots: Slot[] }[];
      const myRow    = rows.find(r => r.perfil_id === userId);
      const rivalRow = rows.find(r => r.perfil_id !== userId);

      if (myRow) {
        setMySlots(myRow.slots ?? []);
        setMySubmitted(true);
        setIsEditing(false);
      } else {
        setMySlots([]);
        setMySubmitted(false);
        setIsEditing(true);
      }

      if (rivalRow) {
        setRivalSlots(rivalRow.slots ?? []);
        setRivalSubmitted(true);
      } else {
        setRivalSlots([]);
        setRivalSubmitted(false);
      }
    } catch {
      setError('No se pudo cargar la información del partido.');
    } finally {
      setLoading(false);
    }
  }, [state?.partido?.id]);

  // ── Init: resolver userId ──────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      let uid = '';
      try {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id ?? '';
      } catch { /* ignorar */ }

      if (!uid) {
        try {
          const stored = localStorage.getItem('app_user');
          uid = stored ? (JSON.parse(stored)?.id ?? '') : '';
        } catch { /* ignorar */ }
      }

      setCurrentUserId(uid);
      if (uid) fetchData(uid);
    };
    init();
  }, [fetchData]);

  // ── Toggle slot en el editor ───────────────────────────────────────────────

  const handleToggle = useCallback((dia: number, franja: Franja) => {
    setEditingSlots(prev => {
      const exists = prev.some(s => s.dia === dia && s.franja === franja);
      if (exists) return prev.filter(s => !(s.dia === dia && s.franja === franja));
      return [...prev, { dia, franja }];
    });
  }, []);

  const startEditing = () => {
    setEditingSlots(mySubmitted ? [...mySlots] : []);
    setIsEditing(true);
  };

  // ── Guardar disponibilidad (upsert) ───────────────────────────────────────

  const handleSave = async () => {
    if (!currentUserId || !state?.partido?.id) return;
    if (editingSlots.length === 0) {
      setError('Seleccioná al menos una franja horaria.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: upsertErr } = await supabase
        .from('partido_disponibilidad')
        .upsert(
          { partido_id: state.partido.id, perfil_id: currentUserId, slots: editingSlots },
          { onConflict: 'partido_id,perfil_id' },
        );
      if (upsertErr) throw upsertErr;
      await fetchData(currentUserId);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la disponibilidad.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmar horario ──────────────────────────────────────────────────────

  const handleConfirmar = async () => {
    if (!overlap || !state?.partido?.id) return;
    const franja = FRANJAS.find(f => f.id === overlap.franja)!;
    const isoTimestamp = nextOccurrenceOf(overlap.dia, franja.inicio);

    setConfirming(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('confirmar_horario_partido', {
        p_partido_id: state.partido.id,
        p_horario: isoTimestamp,
      });
      if (rpcErr) throw rpcErr;
      const rpcResult = data as { ok: boolean; error?: string } | null;
      if (rpcResult && !rpcResult.ok) throw new Error(rpcResult.error ?? 'No se pudo confirmar');

      setEstadoCoord('pactado');
      setHorarioPactado(isoTimestamp);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo confirmar el horario.');
    } finally {
      setConfirming(false);
    }
  };

  // ── Fallback manual ────────────────────────────────────────────────────────

  const handleManual = async () => {
    if (state?.partido?.id) {
      // Fire and forget — no bloqueamos la navegación
      supabase.rpc('set_coordinacion_manual', { p_partido_id: state.partido.id }).then(() => {
        setEstadoCoord('manual');
      });
    }
    const link = toWhatsAppLink(state?.rivalWhatsapp);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  // ─── Guard ────────────────────────────────────────────────────────────────

  if (!state?.partido?.id) return <Navigate to="/tournament-panel" replace />;

  // ─── Info del horario pactado ─────────────────────────────────────────────

  const pactadoFranja = horarioPactado
    ? (() => {
        const d = new Date(horarioPactado);
        const dow = (d.getDay() + 6) % 7;
        const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const fecha = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
        const franjaObj = FRANJAS.find(f => {
          const [fh] = f.inicio.split(':').map(Number);
          return d.getHours() === fh;
        });
        return { dow, hora, fecha, franjaObj };
      })()
    : null;

  const isJugador1 = currentUserId === state.partido.jugador1_id;

  const overlapFranjaObj = overlap ? FRANJAS.find(f => f.id === overlap.franja) : null;
  const overlapHora1Fin = overlapFranjaObj
    ? (() => {
        const [h, m] = overlapFranjaObj.inicio.split(':').map(Number);
        return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      })()
    : '';
  const overlapHora2Fin = overlapFranjaObj
    ? (() => {
        const [h, m] = overlapFranjaObj.inicio.split(':').map(Number);
        return `${String(h + 2).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      })()
    : '';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f6f8f6] flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#f6f8f6]/90 backdrop-blur-md px-4 py-4 flex items-center gap-3 border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="size-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <span className="material-symbols-outlined text-[#111813]" style={{ fontSize: 22 }}>arrow_back_ios</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-[#111813] font-[Lexend]">Coordinar Partido</h1>
          <p className="text-xs text-gray-500 font-medium truncate">vs. {state.rivalNombre}</p>
        </div>
        {/* Badge de estado */}
        {estadoCoord === 'pendiente' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wide shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule</span>
            Pendiente
          </span>
        )}
        {estadoCoord === 'pactado' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[#0eb538] text-[10px] font-bold uppercase tracking-wide shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
            Confirmado
          </span>
        )}
        {estadoCoord === 'manual' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-bold uppercase tracking-wide shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>chat</span>
            Manual
          </span>
        )}
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-5 space-y-4 pb-10">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#13ec49] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Estado PACTADO ──────────────────────────────────────────── */}
            {estadoCoord === 'pactado' && pactadoFranja && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#13ec49]" />
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#13ec49]" style={{ fontSize: 28 }}>event_available</span>
                  <div>
                    <p className="text-xs font-bold text-[#13ec49] uppercase tracking-wider">¡Horario confirmado!</p>
                    <h2 className="text-lg font-black text-[#111813] font-[Lexend] capitalize">{pactadoFranja.fecha}</h2>
                    <p className="text-sm font-bold text-[#4a9c40]">
                      {pactadoFranja.hora} – {
                        (() => {
                          const d = new Date(horarioPactado!);
                          d.setHours(d.getHours() + 2);
                          return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                        })()
                      }
                    </p>
                  </div>
                </div>

                {/* Roles */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`rounded-xl p-3 text-center ${isJugador1 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#4a9c40] mb-1">Turno 1</p>
                    <p className="text-sm font-bold text-[#111813]">
                      {pactadoFranja.hora} – {
                        (() => {
                          const d = new Date(horarioPactado!);
                          d.setHours(d.getHours() + 1);
                          return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                        })()
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isJugador1 ? '👤 Vos reservás' : `👤 ${state.rivalNombre.split(' ')[0]} reserva`}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${!isJugador1 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 mb-1">Turno 2</p>
                    <p className="text-sm font-bold text-[#111813]">
                      {
                        (() => {
                          const d = new Date(horarioPactado!);
                          d.setHours(d.getHours() + 1);
                          return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                        })()
                      } – {
                        (() => {
                          const d = new Date(horarioPactado!);
                          d.setHours(d.getHours() + 2);
                          return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                        })()
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {!isJugador1 ? '👤 Vos reservás' : `👤 ${state.rivalNombre.split(' ')[0]} reserva`}
                    </p>
                  </div>
                </div>

                {/* WhatsApp links — solo visibles en estado pactado */}
                <div className="space-y-2.5">
                  {toWhatsAppLink(state.rivalWhatsapp) && (
                    <a
                      href={toWhatsAppLink(state.rivalWhatsapp)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#25D366] text-white font-bold text-sm shadow-md active:scale-[0.98] transition-all"
                    >
                      <WhatsAppIcon />
                      WhatsApp de {state.rivalNombre.split(' ')[0]}
                    </a>
                  )}
                  {toWhatsAppLink(state.myWhatsapp) && (
                    <a
                      href={toWhatsAppLink(state.myWhatsapp)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-[#25D366] text-[#25D366] bg-white font-semibold text-sm active:scale-[0.98] transition-all"
                    >
                      <WhatsAppIcon className="size-4 fill-current" />
                      Mi WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* ── Mi disponibilidad ───────────────────────────────────────── */}
            {estadoCoord !== 'pactado' && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#13ec49]" />
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-[#111813] text-sm">Mi disponibilidad</h3>
                  {mySubmitted && !isEditing && (
                    <button
                      onClick={startEditing}
                      className="text-xs font-bold text-[#4a9c40] underline underline-offset-2"
                    >
                      Editar
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      Seleccioná los días y franjas en que podés jugar. El partido dura 2 horas dentro de cada franja.
                    </p>
                    <DisponibilidadGrid
                      slots={editingSlots}
                      editable
                      onToggle={handleToggle}
                    />
                    {error && (
                      <p className="mt-3 text-xs text-red-500 font-medium">{error}</p>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving || editingSlots.length === 0}
                      className="mt-4 w-full py-3 rounded-xl bg-[#13ec49] text-[#111813] font-bold text-sm shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {saving ? 'Guardando…' : 'Guardar disponibilidad'}
                    </button>
                  </>
                ) : (
                  <>
                    <DisponibilidadGrid slots={mySlots} editable={false} />
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      {mySlots.length} franja{mySlots.length !== 1 ? 's' : ''} seleccionada{mySlots.length !== 1 ? 's' : ''}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── Disponibilidad del rival ────────────────────────────────── */}
            {estadoCoord !== 'pactado' && mySubmitted && !isEditing && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gray-200" />
                <h3 className="font-bold text-[#111813] text-sm mb-3">
                  Disponibilidad de {state.rivalNombre.split(' ')[0]}
                </h3>
                {rivalSubmitted ? (
                  <DisponibilidadGrid slots={rivalSlots} editable={false} />
                ) : (
                  <div className="flex items-start gap-3 py-2">
                    <span className="material-symbols-outlined text-amber-400 shrink-0" style={{ fontSize: 20 }}>hourglass_empty</span>
                    <p className="text-sm text-gray-500">
                      Tu rival todavía no cargó su disponibilidad. Cuando lo haga, verás si hay un horario en común.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Resultado del algoritmo ─────────────────────────────────── */}
            {estadoCoord === 'pendiente' && mySubmitted && rivalSubmitted && !isEditing && (
              overlap ? (
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#13ec49]" />
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[#13ec49]" style={{ fontSize: 24 }}>event_available</span>
                    <h3 className="font-bold text-[#111813]">¡Horario en común encontrado!</h3>
                  </div>
                  <p className="text-xl font-black text-[#111813] font-[Lexend]">{DIAS_SEMANA[overlap.dia]}</p>
                  <p className="text-base font-bold text-[#4a9c40] mb-1">
                    {overlapFranjaObj?.label} — {overlapFranjaObj?.inicio} a {overlapHora2Fin}
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    El sistema reservó un bloque de 2 horas dentro de la franja {overlapFranjaObj?.label.toLowerCase()} ({overlapFranjaObj?.rango}).
                  </p>

                  {/* Roles */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className={`rounded-xl p-3 text-center ${isJugador1 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#4a9c40] mb-1">Turno 1</p>
                      <p className="text-sm font-bold text-[#111813]">
                        {overlapFranjaObj?.inicio} – {overlapHora1Fin}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {isJugador1 ? '👤 Vos reservás' : `👤 ${state.rivalNombre.split(' ')[0]} reserva`}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${!isJugador1 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 mb-1">Turno 2</p>
                      <p className="text-sm font-bold text-[#111813]">
                        {overlapHora1Fin} – {overlapHora2Fin}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {!isJugador1 ? '👤 Vos reservás' : `👤 ${state.rivalNombre.split(' ')[0]} reserva`}
                      </p>
                    </div>
                  </div>

                  {error && <p className="mb-3 text-xs text-red-500 font-medium">{error}</p>}

                  <button
                    onClick={handleConfirmar}
                    disabled={confirming}
                    className="w-full py-3 rounded-xl bg-[#13ec49] text-[#111813] font-bold text-sm shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {confirming ? 'Confirmando…' : 'Confirmar este horario'}
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-500 shrink-0" style={{ fontSize: 20 }}>search_off</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">No hay franjas en común esta semana.</p>
                      <p className="text-xs text-amber-600 mt-1">
                        Agregá más disponibilidad o coordinen manualmente.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={startEditing}
                    className="mt-3 text-sm font-bold text-[#4a9c40] underline underline-offset-2"
                  >
                    Editar mis horarios
                  </button>
                </div>
              )
            )}

            {/* ── Tip inicial (ninguno envió aún) ────────────────────────── */}
            {estadoCoord === 'pendiente' && !mySubmitted && (
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex gap-3">
                <span className="material-symbols-outlined text-blue-400 shrink-0" style={{ fontSize: 20 }}>info</span>
                <p className="text-xs text-blue-700">
                  Cargá tu disponibilidad. Cuando tu rival haga lo mismo, el sistema encontrará automáticamente el mejor horario para el partido.
                </p>
              </div>
            )}

            {/* ── Botón manual (siempre visible) ──────────────────────────── */}
            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3">¿Preferís coordinar directamente?</p>
              <button
                onClick={handleManual}
                disabled={!toWhatsAppLink(state.rivalWhatsapp)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm active:scale-[0.98] transition-all ${
                  toWhatsAppLink(state.rivalWhatsapp)
                    ? 'border-[#25D366] bg-white text-[#25D366] hover:bg-[#25D366]/5'
                    : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                }`}
              >
                <WhatsAppIcon className="size-4 fill-current" />
                {toWhatsAppLink(state.rivalWhatsapp)
                  ? 'Coordinar manualmente por WhatsApp'
                  : 'Rival sin WhatsApp registrado'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default CoordinarPartido;
