
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import SponsorBanner from '../components/SponsorBanner';

const Dashboard: React.FC = () => {
 const navigate = useNavigate();
 const { authUser, perfil } = useCurrentUser();
 const isGuest = !authUser;
 const displayName = perfil?.nombre_completo || (isGuest ? 'vecino' : 'Mi Barrio');

 return (
 <div className="relative flex h-full w-full flex-col bg-white font-display text-[#111813] antialiased pb-24 md:pb-0">
 {/* Header */}
 <header className="sticky top-0 z-40 flex items-center justify-between bg-white px-4 md:px-8 py-3 shadow-sm transition-colors border-b border-gray-50 ">
 <div className="flex items-center gap-3">
 {isGuest ? (
 <div className="relative flex items-center justify-center rounded-full size-10 bg-gray-100">
 <span className="material-symbols-outlined text-gray-400" style={{ fontSize: '24px' }}>person</span>
 </div>
 ) : (
 <div className="relative cursor-pointer" onClick={() => navigate('/profile')}>
 <div className="bg-center bg-no-repeat bg-cover rounded-full size-10 ring-2 ring-primary/20"
 style={{ backgroundImage: 'url("/images/dashboard-bg.jpg")' }}></div>
 <div className="absolute bottom-0 right-0 size-3 rounded-full bg-primary border-2 border-white"></div>
 </div>
 )}
 <div className="flex flex-col">
 <span className="text-xs font-medium text-gray-500 leading-none">{isGuest ? 'Bienvenido,' : 'Hola de nuevo,'}</span>
 <h2 className="text-[#111813] text-lg font-bold leading-tight tracking-[-0.015em]">{displayName}</h2>
 </div>
 </div>
 {!isGuest && (
 <button className="relative flex items-center justify-center rounded-full size-10 bg-gray-50 hover:bg-gray-100 text-[#111813] transition-colors">
 <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>notifications</span>
 <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
 <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
 </span>
 </button>
 )}
 {isGuest && (
 <button
 onClick={() => navigate('/register')}
 className="text-xs font-semibold text-primary hover:underline"
 >
 Registrarse
 </button>
 )}
 </header>

 <main className="flex-1 p-4 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto">
 {/* Card: Contratar Servicios */}
 <div
   onClick={() => navigate('/services')}
   className="relative overflow-hidden bg-white rounded-2xl p-6 flex flex-col justify-between min-h-[180px] border-l-8 border-[#13ec49] group cursor-pointer active:scale-[0.97] transition-all duration-300"
   style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.05)' }}
 >
   <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
     <span className="material-symbols-outlined" style={{ fontSize: '120px' }}>home_repair_service</span>
   </div>
   <div className="relative z-10">
     <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-[#006e1c] mb-4">
       <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>handyman</span>
     </div>
     <h3 className="text-2xl font-bold text-[#111813] leading-tight">Contratar Servicios</h3>
     <p className="text-gray-500 text-sm mt-1">Plomería, electricidad y más profesionales cerca de ti.</p>
   </div>
   <div className="mt-4 flex items-center text-[#006e1c] font-bold text-xs uppercase tracking-wider group-hover:translate-x-2 transition-transform duration-200">
     Explorar ahora
     <span className="material-symbols-outlined ml-1" style={{ fontSize: '18px' }}>chevron_right</span>
   </div>
 </div>

 {/* Card: Mis Torneos */}
 <div
   onClick={() => navigate('/tournaments')}
   className="relative overflow-hidden bg-white rounded-2xl p-6 flex flex-col justify-between min-h-[180px] group cursor-pointer active:scale-[0.97] transition-all duration-300 shadow-lg"
 >
   <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 via-yellow-300/15 to-transparent pointer-events-none"></div>
   <div className="flex justify-between items-start relative z-10">
     <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-amber-600">
       <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>emoji_events</span>
     </div>
     <span className="bg-[#13ec49] text-[#005313] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 shadow-sm">
       <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>bolt</span>
       Competir ahora
     </span>
   </div>
   <div className="mt-6 relative z-10">
     <h3 className="text-2xl font-bold text-[#111813] leading-tight">Mis Torneos</h3>
     <p className="text-gray-500 text-sm mt-1">Gestión de equipos, fixture y resultados del barrio.</p>
   </div>
   <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
     <span className="material-symbols-outlined" style={{ fontSize: '100px' }}>sports_soccer</span>
   </div>
 </div>

         <SponsorBanner />
 </main>
 </div>
 );
};

export default Dashboard;
