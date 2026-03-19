import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verifyAddress } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface RegisterProps {
  onComplete?: () => void;
}

const Register: React.FC<RegisterProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      setVerifiedAddress(result.text);
    } catch (err) {
      setError("No pudimos verificar la dirección. Intenta ser más específico.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name || !verifiedAddress || !email || !password || !whatsapp) {
      setError("Por favor completa todos los campos y verifica tu dirección.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;

      if (user) {
        const { error: profileError } = await supabase
          .from('perfiles')
          .insert([
            {
              id: user.id,
              nombre_completo: name,
              whatsapp: whatsapp,
              rol: 'vecino',
            },
          ]);

        if (profileError) throw profileError;

        localStorage.setItem('app_user', JSON.stringify({ name, address: verifiedAddress }));
        
        if (onComplete) {
          onComplete();
        } else {
          navigate('/login');
        }
      }
    } catch (err: any) {
      setError(err.message || "Error al registrar usuario.");
    } finally {
      setLoading(false);
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

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">WhatsApp</label>
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full bg-gray-50 border-gray-200 rounded-xl focus:ring-primary focus:border-primary text-sm p-4 font-medium transition-all"
            placeholder="+54 9 11 1234-5678"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Correo Electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-50 border-gray-200 rounded-xl focus:ring-primary focus:border-primary text-sm p-4 font-medium transition-all"
            placeholder="nombre@ejemplo.com"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-50 border-gray-200 rounded-xl focus:ring-primary focus:border-primary text-sm p-4 font-medium transition-all"
            placeholder="••••••••"
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
        </div>

        {verifiedAddress && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">DIRECCIÓN ENCONTRADA</p>
            <p className="text-sm font-bold text-secondary mt-1">{verifiedAddress}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <p className="text-xs text-red-600 font-bold">{error}</p>
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={!name || !verifiedAddress || !email || !password || !whatsapp || loading}
          className="w-full py-5 bg-primary text-secondary font-black text-lg rounded-2xl shadow-xl shadow-primary/30 mt-4"
        >
          {loading ? 'Procesando...' : 'Finalizar Registro'}
        </button>

        <div className="text-center mt-4">
          <Link to="/login" className="text-primary font-bold hover:underline">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
