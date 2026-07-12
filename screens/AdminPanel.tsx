import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';

console.log('[AdminPanel] Component loaded!');

const AdminPanel: React.FC = () => {
  console.log('[AdminPanel] Rendering...');
  const navigate = useNavigate();
  const { perfil, loading, authUser } = useCurrentUser();

  // Log everything for debugging
  useEffect(() => {
    console.log('[AdminPanel] State:', {
      loading,
      authUser: authUser?.id,
      perfilId: perfil?.id,
      rol: perfil?.rol,
    });
  }, [loading, authUser, perfil]);

  // If still loading, show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <p className="text-slate-600 mb-2">Cargando perfil...</p>
          <p className="text-xs text-slate-400">Espera un momento</p>
        </div>
      </div>
    );
  }

  // If not authenticated and no cached profile, redirect to login
  useEffect(() => {
    if (!authUser && !perfil) {
      navigate('/login', { replace: true });
    }
  }, [authUser, perfil, navigate]);

  // If no profile, show error
  if (!perfil) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <p className="text-slate-600 font-semibold mb-2">Error: Perfil no encontrado</p>
          <p className="text-xs text-slate-400">No se pudo cargar tu perfil</p>
        </div>
      </div>
    );
  }

  // If not admin, redirect to dashboard
  if (perfil.rol !== 'admin') {
    useEffect(() => {
      navigate('/tournaments', { replace: true });
    }, [navigate]);
    return null;
  }

  // ADMIN PANEL - User is admin
  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-800 text-2xl leading-none"
        >
          ‹
        </button>
        <h1 className="font-black text-slate-900 text-lg uppercase tracking-wide">Panel Admin</h1>
        <span className="ml-auto text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
          Admin
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Bienvenido, {perfil.nombre_completo}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* User Info Card */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Tu Información</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-slate-500">Email:</span>{' '}
                  <span className="font-medium text-slate-900">{perfil.email}</span>
                </p>
                <p>
                  <span className="text-slate-500">Rol:</span>{' '}
                  <span className="font-medium text-emerald-700">Admin</span>
                </p>
                <p>
                  <span className="text-slate-500">WhatsApp:</span>{' '}
                  <span className="font-medium text-slate-900">{perfil.whatsapp || '—'}</span>
                </p>
              </div>
            </div>

            {/* System Info Card */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Estado del Sistema</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Autenticado</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Perfil cargado</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  <span>Permisos de admin</span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-600 uppercase mb-3">Acciones</h3>
            <button
              onClick={() => navigate('/tournaments')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              Ir a Torneos
            </button>
          </div>
        </div>

        {/* Developer Info */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
          <p className="font-semibold mb-2">🔧 Info para desarrolladores:</p>
          <p>Perfil ID: {perfil.id}</p>
          <p>Auth User ID: {authUser?.id}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
