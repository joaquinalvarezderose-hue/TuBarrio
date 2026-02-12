
import React, { useState } from 'react';
import { verifyAddress } from '../services/geminiService';

interface RegisterProps {
  onComplete: () => void;
}

const Register: React.FC<RegisterProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      let location = undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (e) {
        console.warn("Location permission denied or unavailable.");
      }

      const result = await verifyAddress(address, location);
      // If grounding metadata is available, we prioritize it
      if (result.grounding) {
         setVerifiedAddress(result.text);
      } else {
         setVerifiedAddress(result.text);
      }
    } catch (err) {
      setError("No pudimos verificar la dirección. Intenta ser más específico.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    if (name && verifiedAddress) {
      localStorage.setItem('app_user', JSON.stringify({ name, address: verifiedAddress }));
      onComplete();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 justify-center min-h-screen">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center size-16 bg-primary/10 text-primary rounded-full mb-4">
          <span className="material-symbols-outlined text-4xl">location_on</span>
        </div>
        <h1 className="text-3xl font-black text-secondary mb-2 tracking-tight">Bienvenido a Mi Barrio</h1>
        <p className="text-gray-500 text-sm">Registra tu domicilio verificado para acceder a la red comunitaria.</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Nombre Completo</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-50 border-gray-200 rounded-xl focus:ring-primary focus:border-primary text-sm p-4 font-medium transition-all"
            placeholder="Ej: Mateo Rossi"
          />
        </div>

        <div className="relative">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Dirección de Domicilio</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flex-1 bg-gray-50 border-gray-200 rounded-xl focus:ring-primary focus:border-primary text-sm p-4 font-medium transition-all"
              placeholder="Calle 123, Barrio Norte..."
            />
            <button
              onClick={handleVerify}
              disabled={loading || !address}
              className="bg-secondary text-white px-5 rounded-xl hover:bg-black transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center"
            >
              <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'progress_activity' : 'google_plus_rescale'}
              </span>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-gray-400 ml-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">map</span>
            Verificación impulsada por Google Maps Grounding.
          </p>
        </div>

        {verifiedAddress && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary font-bold">verified</span>
              <div className="flex-1">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">DIRECCIÓN ENCONTRADA</p>
                <p className="text-sm font-bold text-secondary mt-1">{verifiedAddress}</p>
              </div>
            </div>
            
            {/* Visual feedback mimicking a map location */}
            <div className="mt-4 h-32 w-full bg-gray-100 rounded-xl overflow-hidden relative border border-primary/10 shadow-inner">
               <img 
                 src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=400&h=200&fit=crop" 
                 className="w-full h-full object-cover grayscale opacity-40" 
                 alt="map mockup" 
               />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="relative">
                    <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping"></div>
                    <span className="material-symbols-outlined text-primary text-5xl filled relative z-10">location_on</span>
                 </div>
               </div>
               <div className="absolute bottom-2 right-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-[8px] font-black text-gray-500 uppercase">
                 Google Maps Grounding Active
               </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 animate-shake">
            <span className="material-symbols-outlined text-red-500">error</span>
            <p className="text-xs text-red-600 font-bold">{error}</p>
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={!name || !verifiedAddress}
          className="w-full py-5 bg-primary text-secondary font-black text-lg rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/40 transition-all disabled:opacity-50 active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
        >
          Finalizar Registro
          <span className="material-symbols-outlined font-black">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};

export default Register;
