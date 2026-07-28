import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequireRole } from '../hooks/useRequireRole';
import { supabase } from '../services/supabaseClient';
import { Skeleton } from '../components/Skeleton';

type TorneoRow = {
  id: number;
  titulo: string;
  subtitulo: string;
  activo: boolean;
  cancelado: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  creado_por: string | null;
  deporte: string | null;
};

const OrganizadorPanel: React.FC = () => {
  const navigate = useNavigate();
  const { perfil, loading, hasAccess } = useRequireRole(['admin', 'organizador']);

  const [torneos, setTorneos] = useState<TorneoRow[]>([]);
  const [loadingTorneos, setLoadingTorneos] = useState(true);

  useEffect(() => {
    if (!hasAccess || !perfil) return;
    let cancelled = false;
    (async () => {
      setLoadingTorneos(true);
      let query = supabase
        .from('torneos')
        .select('id, titulo, subtitulo, activo, cancelado, fecha_inicio, fecha_fin, creado_por, deporte')
        .order('created_at', { ascending: false });

      if (perfil.rol === 'organizador') {
        query = query.eq('creado_por', perfil.id);
      }

      const { data, error } = await query;
      if (cancelled) return;
      setLoadingTorneos(false);
      if (error) {
        console.error('[OrganizadorPanel] load torneos error:', error);
        return;
      }
      setTorneos((data ?? []) as TorneoRow[]);
    })();
    return () => { cancelled = true; };
  }, [hasAccess, perfil]);

  if (loading || !perfil) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-100">
        <div className="bg-white border-b border-slate-200 px-4 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (!hasAccess) return null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between gap-3">
        <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide">Mis Torneos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/organizador/torneos/nuevo')}
            className="bg-primary hover:opacity-90 text-white text-sm font-bold py-2 px-4 rounded-lg transition"
          >
            + Tenis
          </button>
          <button
            onClick={() => navigate('/golf/organizador/nuevo')}
            className="bg-[#4a9c40] hover:opacity-90 text-white text-sm font-bold py-2 px-4 rounded-lg transition"
          >
            + Golf
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {loadingTorneos ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : torneos.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">Todavia no creaste ningun torneo.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {torneos.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.deporte === 'golf') {
                    navigate('/golf/panel', {
                      state: {
                        tournament: {
                          id: t.id,
                          title: t.titulo,
                          subtitle: t.subtitulo,
                          image: null,
                          deporte: 'golf',
                        },
                      },
                    });
                  } else {
                    navigate(`/organizador/torneos/${t.id}`);
                  }
                }}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-primary transition flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                    {t.deporte === 'golf' && <span className="material-symbols-outlined text-[16px] text-[#4a9c40]">golf_course</span>}
                    {t.titulo}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.subtitulo}
                    {t.fecha_inicio ? ` · desde ${t.fecha_inicio}` : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {t.cancelado && (
                    <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 text-red-700">Cancelado</span>
                  )}
                  {!t.activo && !t.cancelado && (
                    <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-500">Archivado</span>
                  )}
                  {t.activo && !t.cancelado && (
                    <span className="text-xs font-bold px-2 py-1 rounded bg-green-100 text-green-700">Activo</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizadorPanel;
