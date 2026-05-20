
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from './Logo';

const Navigation: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();

 // Hide navigation on payment, confirmation, and tournament details screens to avoid UI overlap
 const hideNavOn = ['/payment', '/confirmation', '/tournament-details'];
 if (hideNavOn.includes(location.pathname)) {
 return null;
 }

 const navItems = [
 { label: 'Inicio', icon: 'home', path: '/' },
 { label: 'Servicios', icon: 'handyman', path: '/services' },
 { label: 'Torneos', icon: 'emoji_events', path: '/tournaments' },
 { label: 'Perfil', icon: 'person', path: '/profile' }
 ];

 return (
 <nav className="fixed bottom-0 left-0 right-0 z-50 md:static md:w-64 md:h-screen md:flex-col md:border-r md:border-t-0 bg-white border-t border-gray-100 flex justify-around md:justify-start items-center md:items-stretch py-2 md:py-8 md:px-4 shadow-lg md:shadow-none">
 
 <div className="hidden md:flex items-center px-4 mb-10">
 <Logo variant="primary" className="h-[120px] w-auto" />
 </div>

 <div className="contents md:flex md:flex-col md:gap-2 w-full">
 {navItems.map((item) => {
 const isActive = location.pathname === item.path;
 return (
 <button
 key={item.path}
 onClick={() => navigate(item.path)}
 className={`flex flex-col md:flex-row items-center md:gap-4 md:px-4 md:py-3 md:rounded-xl transition-all ${
 isActive 
 ? 'text-primary md:bg-primary/10 font-bold' 
 : 'text-gray-400 hover:text-gray-600 md:hover:bg-gray-50 '
 }`}
 >
 <span className={`material-symbols-outlined text-2xl ${isActive ? 'fill-1' : ''}`}>
 {item.icon}
 </span>
 <span className="text-[10px] md:text-sm md:font-bold">{item.label}</span>
 </button>
 );
 })}
 </div>

 {/* Premium card removed for MVP */}
 </nav>
 );
};

export default Navigation;
