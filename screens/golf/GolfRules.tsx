import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { Skeleton } from '../../components/Skeleton';

type ConfigRow = {
  cancha_id: number;
  sistema_handicap: string;
  criterio_desempate: string;
  reglas_texto: string | null;
};

const GolfRules: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tournament = location.state?.tournament;
  const { perfil } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [creadoPor, setCreadoPor] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sistemaHandicap, setSistemaHandicap] = useState('');
  const [criterioDesempate, setCriterioDesempate] = useState('');
  const [reglasTexto, setReglasTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tournament?.id) return;
    (async () => {
      setLoading(true);
      const [{ data: cfg }, { data: torneoRow }] = await Promise.all([
        supabase
          .from('torneo_golf_config')
          .select('cancha_id, sistema_handicap, criterio_desempate, reglas_texto')
          .eq('torneo_id', tournament.id)
          .maybeSingle(),
        supabase.from('torneos').select('creado_por').eq('id', tournament.id).maybeSingle(),
      ]);
      setConfig((cfg as any) ?? null);
      setCreadoPor((torneoRow as any)?.creado_por ?? null);
      if (cfg) {
        setSistemaHandicap((cfg as any).sistema_handicap || '');
        setCriterioDesempate((cfg as any).criterio_desempate || '');
        setReglasTexto((cfg as any).reglas_texto || '');
      }
      setLoading(false);
    })();
  }, [tournament?.id]);

  const canManage = !!perfil && (perfil.rol === 'admin' || (perfil.rol === 'organizador' && creadoPor === perfil.id));

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('actualizar_reglas_golf', {
        p_torneo_id: tournament.id,
        p_sistema_handicap: sistemaHandicap.trim() || null,
        p_criterio_desempate: criterioDesempate.trim() || null,
        p_reglas_texto: reglasTexto.trim() || null,
      });
      if (error) throw error;
      setConfig((prev) => (prev ? { ...prev, sistema_handicap: sistemaHandicap, criterio_desempate: criterioDesempate, reglas_texto: reglasTexto } : prev));
      setMessage('Reglas actualizadas.');
      setEditMode(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudieron guardar las reglas.');
    } finally {
      setSaving(false);
    }
  };

  if (!tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-light p-6 text-center">
        <p className="text-slate-500">No encontramos el torneo seleccionado.</p>
        <button onClick={() => navigate('/tournaments')} className="mt-4 text-[#4a9c40] font-bold">Volver</button>
      </div>
    );
  }

  return (
    <div className="bg-background-light min-h-screen font-display pb-16 max-w-md mx-auto">
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Reglamento</h1>
        </div>
        {canManage && !loading && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className="text-xs font-bold text-[#4a9c40] px-3 py-1.5 rounded-full bg-[#4a9c40]/10"
          >
            {editMode ? 'Cancelar' : 'Editar'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <>
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-3 py-2 font-medium">{message}</div>}
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 font-medium">{errorMsg}</div>}

            {!config ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
                Este torneo todavia no tiene reglas configuradas.
              </div>
            ) : editMode ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Sistema de handicap</label>
                  <input value={sistemaHandicap} onChange={(e) => setSistemaHandicap(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Criterio de desempate</label>
                  <input value={criterioDesempate} onChange={(e) => setCriterioDesempate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Reglamento</label>
                  <textarea value={reglasTexto} onChange={(e) => setReglasTexto(e.target.value)} rows={8} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-[#4a9c40] hover:bg-[#3d8b33] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition"
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase mb-1">Sistema de handicap</h2>
                  <p className="text-slate-800">{config.sistema_handicap}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase mb-1">Criterio de desempate</h2>
                  <p className="text-slate-800">{config.criterio_desempate}</p>
                </div>
                {config.reglas_texto && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h2 className="text-sm font-bold text-slate-500 uppercase mb-1">Reglamento</h2>
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">{config.reglas_texto}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Reglas Locales - El Cantón */}
        <div className="pt-4">
          <h2 className="text-lg font-bold mb-1 text-slate-900">Reglas Locales</h2>
          <p className="text-slate-500 text-sm font-medium mb-3">El Cantón Golf — según tarjeta oficial de la cancha.</p>

          <div className="space-y-3">
            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm" open>
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">fence</span>
                  <span className="font-semibold text-slate-800">Límites de la Cancha (Regla 27)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                <p>a) Las estacadas o líneas blancas.</p>
                <p>b) El borde interno de las calles que delimitan la cancha de golf.</p>
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">signpost</span>
                  <span className="font-semibold text-slate-800">Obstrucciones Inamovibles (Regla 24-2)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                Todas las cosas artificiales fijas instaladas en la cancha. Incluye las marcas que se encuentran en el centro de cada fairway, caminos que se encuentran dentro del campo de juego, aspersores de riego, carteles indicadores de los sitios de salida, bancos, etc. El jugador podrá liberarse en el caso que interfieran en su stance o swing.
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">golf_course</span>
                  <span className="font-semibold text-slate-800">Pelota Enterrada en su Propio Pique</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                A través de la cancha, una pelota enterrada en su propio pique podrá ser levantada, limpiada y dropeada, sin penalidad, lo más cerca posible de donde descansaba pero no más cerca del hoyo.
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">sports_golf</span>
                  <span className="font-semibold text-slate-800">Obstrucciones Movibles (Regla 24-1)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                Las estacas de hazards de agua, hazard de agua lateral, zonas de dropeo y terreno en reparación.
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">construction</span>
                  <span className="font-semibold text-slate-800">Terreno en Reparación (Regla 25)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                <ol className="space-y-2 list-none">
                  <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">a)</span> Las zonas así definidas con líneas o estacas azules.</li>
                  <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">b)</span> Solamente cuando la pelota descansa en la huella de vehículo (solo cuando es una depresión en el suelo).</li>
                  <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">c)</span> Zanjas de drenaje (depresión en el terreno).</li>
                  <li className="flex gap-2"><span className="font-bold text-[#4a9c40] shrink-0">d)</span> Panes de pastos a través de la cancha.</li>
                </ol>
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">water</span>
                  <span className="font-semibold text-slate-800">Hazard de Agua (Regla 26)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                Sus límites están definidos por estacas o líneas amarillas.
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">waves</span>
                  <span className="font-semibold text-slate-800">Hazard de Agua Lateral (Regla 26)</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                Sus límites están definidos por estacas o líneas rojas.
              </div>
            </details>

            <details className="group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4a9c40]">potted_plant</span>
                  <span className="font-semibold text-slate-800">Plantaciones Jóvenes</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-slate-600 text-sm leading-relaxed font-medium">
                <p className="mb-2 text-xs text-slate-500">Identificadas por estacas o tutores azules.</p>
                Cuando una "Plantación Joven" así marcada por la comisión de golf interfiere el asiento de la pelota, el stance o el espacio en el que el jugador intenta el swing, o cuando la pelota descansa en la cazuela, esta <strong className="text-slate-800">deberá</strong> aliviarse de tal condición, dropeando una pelota, sin penalidad y sin acercarse al hoyo, dentro del largo de un palo del punto de alivio más cercano. La pelota levantada bajo esta condición podrá ser limpiada.
              </div>
            </details>
          </div>

          <div className="mt-3 bg-[#4a9c40]/10 border border-[#4a9c40]/30 rounded-xl px-4 py-3 text-center">
            <p className="text-xs font-bold text-slate-700">Penalidad por quebrantar la regla local: <span className="text-[#4a9c40]">dos golpes</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GolfRules;
