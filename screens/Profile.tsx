import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { WhatsAppE164Schema } from '../lib/schemas';

const Profile: React.FC = () => {
 const navigate = useNavigate();
 const { authUser, perfil, refresh } = useCurrentUser();
 const [editingWa, setEditingWa] = useState(false);
 const [waValue, setWaValue] = useState<string>('');
 const [waSaving, setWaSaving] = useState(false);
 const [waError, setWaError] = useState<string | null>(null);
 const [waSuccess, setWaSuccess] = useState(false);

 useEffect(() => {
 setWaValue(perfil?.whatsapp || '');
 }, [perfil?.whatsapp]);

 const handleSaveWhatsapp = async () => {
 setWaError(null);
 setWaSuccess(false);
 if (waValue) {
 const parsed = WhatsAppE164Schema.safeParse(waValue);
 if (!parsed.success) {
 setWaError(parsed.error.issues[0]?.message ?? 'Número inválido');
 return;
 }
 }
 setWaSaving(true);
 try {
 const userId = authUser?.id;
 if (!userId) throw new Error('Sin sesión');
 const { error } = await supabase
 .from('perfiles')
 .update({ whatsapp: waValue || null })
 .eq('id', userId);
 if (error) throw error;
 await refresh();
 setWaSuccess(true);
 setEditingWa(false);
 } catch (err: any) {
 setWaError(err?.message || 'No se pudo guardar');
 } finally {
 setWaSaving(false);
 }
 };

 const handleLogout = async () => {
 try {
 await supabase.auth.signOut({ scope: 'global' });
 } catch (err) {
 console.error('Logout error:', err);
 } finally {
 localStorage.clear();
 sessionStorage.clear();
 window.location.href = '/#/login';
 }
 };

 // Compatibilidad con el JSX existente: mapear nombre_completo → name
 const user = {
 id: perfil?.id ?? authUser?.id,
 email: perfil?.email ?? authUser?.email ?? null,
 name: perfil?.nombre_completo ?? 'Jugador',
 nombre_completo: perfil?.nombre_completo ?? null,
 whatsapp: perfil?.whatsapp ?? null,
 direccion: perfil?.direccion ?? null,
 address: perfil?.direccion ?? null,
 };

 return (
 <div className="flex flex-col h-full bg-background-light font-display text-slate-900 pb-20 overflow-y-auto no-scrollbar">
 {/* Header */}
 <div className="flex items-center justify-between p-4 sticky top-0 z-50 bg-background-light/80 backdrop-blur-md">
 <button 
 onClick={() => navigate(-1)}
 className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 transition-colors text-slate-900 "
 >
 <span className="material-symbols-outlined">arrow_back</span>
 </button>
 <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-10">Mi Perfil</h2>
 </div>

 {/* Avatar Section */}
 <div className="flex flex-col items-center px-6 pt-2 pb-6">
 <div className="relative mb-4 group">
 <div className="liquid-ring size-36 rounded-full flex items-center justify-center p-1.5 shadow-sm">
 <div className="bg-background-light size-full rounded-full flex items-center justify-center p-1.5 overflow-hidden relative">
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

 {/* WhatsApp Section */}
 <div className="px-4 pb-4">
 <div className="bg-surface-light rounded-xl border border-gray-100 shadow-sm p-4">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <div className="bg-green-50 text-green-600 p-2 rounded-lg">
 <span className="material-symbols-outlined text-[20px]">call</span>
 </div>
 <span className="font-medium text-slate-900 text-sm tracking-tight">WhatsApp</span>
 </div>
 {!editingWa && (
 <button
 onClick={() => { setEditingWa(true); setWaError(null); setWaSuccess(false); }}
 className="text-xs font-bold text-primary hover:underline"
 >
 {user?.whatsapp ? 'Editar' : 'Agregar'}
 </button>
 )}
 </div>
 {editingWa ? (
 <div className="space-y-2">
 <input
 type="tel"
 className="w-full px-3 py-2.5 bg-white border border-outline rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
 placeholder="+54 9 11 1234-5678"
 value={waValue}
 onChange={(e) => setWaValue(e.target.value)}
 />
 {waError && <p className="text-xs text-red-600">{waError}</p>}
 <div className="flex gap-2">
 <button
 onClick={handleSaveWhatsapp}
 disabled={waSaving}
 className="flex-1 bg-primary text-secondary font-black text-sm py-2 rounded-xl disabled:opacity-50"
 >
 {waSaving ? 'Guardando…' : 'Guardar'}
 </button>
 <button
 onClick={() => { setEditingWa(false); setWaValue(user?.whatsapp || ''); }}
 className="flex-1 border border-gray-200 text-slate-600 font-semibold text-sm py-2 rounded-xl"
 >
 Cancelar
 </button>
 </div>
 </div>
 ) : (
 <p className="text-sm text-slate-500 ml-10">
 {waSuccess ? '✓ Guardado' : (user?.whatsapp || <span className="text-amber-500 font-semibold">Sin WhatsApp — los rivales no podrán contactarte</span>)}
 </p>
 )}
 </div>
 </div>

 {/* Settings Section */}
 <div className="px-4 pb-8 flex-1">
 <div className="bg-surface-light rounded-xl overflow-hidden border border-gray-100 shadow-sm">
 <button onClick={() => navigate('/domicilio')} className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors group border-b border-gray-100 last:border-0">
 <div className="flex items-center gap-3">
 <div className="bg-blue-50 text-blue-600 p-2 rounded-lg flex items-center justify-center">
 <span className="material-symbols-outlined text-[20px]">real_estate_agent</span>
 </div>
 <span className="font-medium text-slate-900 text-left text-sm tracking-tight">Mi Domicilio</span>
 </div>
 <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
 </button>
 
 <button onClick={() => navigate('/ayuda')} className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors group last:border-0">
 <div className="flex items-center gap-3">
 <div className="bg-teal-50 text-teal-600 p-2 rounded-lg flex items-center justify-center">
 <span className="material-symbols-outlined text-[20px]">help</span>
 </div>
 <span className="font-medium text-slate-900 text-left text-sm tracking-tight">Centro de Ayuda</span>
 </div>
 <span className="material-symbols-outlined text-gray-400 text-[20px] group-hover:translate-x-1 transition-transform">chevron_right</span>
 </button>
 </div>
 </div>

 {/* Logout & Footer */}
 <div className="px-4 pb-8 mt-auto">
 <button 
 onClick={handleLogout}
 className="w-full p-4 rounded-xl border border-red-100 text-red-600 font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
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