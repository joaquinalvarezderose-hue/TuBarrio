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
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100">
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h1 className="font-black text-slate-900 text-lg">Reglamento</h1>
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
            {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{message}</div>}
            {errorMsg && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{errorMsg}</div>}

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
      </div>
    </div>
  );
};

export default GolfRules;
