import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('app_user');
  const user = userStr ? JSON.parse(userStr) : { name: "Mateo Rossi", address: "Calle Falsa 123" };

  const handleLogout = async () => {
    try {
      // Sign out from Supabase with global scope (all devices/tabs)
      await (supabase as any).auth.signOut({ scope: 'global' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear ALL storage
      localStorage.clear();  // Remove all localStorage including app_user
      sessionStorage.clear();  // Remove all sessionStorage
      
      // Clear Supabase specific items
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('sb-your-project-ref-auth-token');
      
      // Force navigation to login using HashRouter format
      window.location.href = '/#/login';
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white pb-20 overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <button 
          onClick={() => navigate(-1)}
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-10">Mi Perfil</h2>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center px-6 pt-2 pb-6">
        <div className="relative mb-4 group">
          <div className="liquid-ring size-36 rounded-full flex items-center justify-center p-1.5 shadow-sm">
            <div className="bg-background-light dark:bg-background-dark size-full rounded-full flex items-center justify-center p-1.5 overflow-hidden relative">
              <div className="size-full rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-3xl font-bold uppercase">
                {String(user?.name || 'Jugador')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((chunk: string) => chunk[0])
                  .join('') || 'J'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center text-center mt-2">
          <h1 className="text-2xl font-bold tracking-tight mb-1">{user.name}</h1>
        </div>
      </div>

      {/* Settings Section */}
      <div className="px-4 pb-8 flex-1">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl overflow-hidden border border-gray-100 dark:border-white/5 shadow-sm">
          <button className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 p-2 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">real_estate_agent</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-white text-left text-sm tracking-tight">Mi Domicilio</span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>
          
          <button className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="flex items-center gap-3">
              <div className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 p-2 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">security</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-white text-left text-sm tracking-tight">Configuración de Seguridad</span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="flex items-center gap-3">
              <div className="bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 p-2 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">notifications</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-white text-left text-sm tracking-tight">Preferencias de Notificaciones</span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group last:border-0">
            <div className="flex items-center gap-3">
              <div className="bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 p-2 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">help</span>
              </div>
              <span className="font-medium text-slate-900 dark:text-white text-left text-sm tracking-tight">Centro de Ayuda</span>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Logout & Footer */}
      <div className="px-4 pb-8 mt-auto">
        <button 
          onClick={handleLogout}
          className="w-full p-4 rounded-xl border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Cerrar Sesión
        </button>
        <p className="text-center text-[10px] text-gray-400 mt-4 font-bold tracking-widest uppercase">TuBarrio AR v2.4.0</p>
      </div>
    </div>
  );
};

export default Profile;