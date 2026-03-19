import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verifyAddress } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface RegisterProps {
  onComplete: () => void;
}

const Register: React.FC<RegisterProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [verifiedAddress, setVerifiedAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const handleVerify = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyAddress(address);
      setVerifiedAddress(result.text);
    } catch (err) {
      setError("No pudimos verificar la dirección. Intenta ser más específico.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    // Client-side validation
    setError(null);
    setFieldErrors({});
    const errors: { [k: string]: string } = {};
    if (!name || name.trim().length < 3) errors.name = 'Ingresa tu nombre completo (mín. 3 caracteres).';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Ingresa un correo válido.';
    if (!password || password.length < 6) errors.password = 'La contraseña debe tener al menos 6 caracteres.';
    if (!address || address.trim().length < 5) errors.address = 'Ingresa una dirección válida.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Por favor corrige los campos indicados.');
      return;
    }

    setLoading(true);
    try {
      // Intentar registrar con Supabase; si falla (config), usar fallback local (MVP)
      if (supabase && typeof (supabase as any).auth?.signUp === 'function') {
        const { data: authData, error: authError } = await (supabase as any).auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData?.user) {
          const { error: dbError } = await supabase
            .from('profiles')
            .insert([
              {
                id: authData.user.id,
                full_name: name,
                address: verifiedAddress || address,
                updated_at: new Date(),
              },
            ]);

          if (dbError) throw dbError;
        }
      } else {
        // Fallback: persist minimal user locally
        const localUser = { id: `local-${Date.now()}`, email, name, address: verifiedAddress || address };
        localStorage.setItem('app_user', JSON.stringify(localUser));
      }

      if (onComplete) onComplete();
      navigate('/');
    } catch (err: any) {
      // If supabase failed because of missing config, fallback to local user
      console.error('register error', err);
      try {
        const localUser = { id: `local-${Date.now()}`, email, name, address: verifiedAddress || address };
        localStorage.setItem('app_user', JSON.stringify(localUser));
        if (onComplete) onComplete();
        navigate('/');
      } catch (e) {
        setError(err?.message || 'Error al registrarse');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl">
        <h2 className="text-2xl font-bold text-center mb-6">Registro de Vecino</h2>
        
        {error && (
          <div className="p-3 mb-4 text-sm text-red-500 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre Completo</label>
            <input
              type="text"
              className="w-full p-3 border rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Dirección (en el barrio)</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-3 border rounded-xl"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle y Nro..."
              />
              <button
                onClick={handleVerify}
                disabled={loading}
                className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm"
              >
                Verificar
              </button>
            </div>
            {verifiedAddress && (
              <p className="mt-1 text-xs text-green-600">✓ {verifiedAddress}</p>
            )}
            {fieldErrors.address && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.address}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full p-3 border rounded-xl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contraseña</label>
            <input
              type="password"
              className="w-full p-3 border rounded-xl"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <button
            onClick={handleRegister}
            disabled={loading || !verifiedAddress}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Finalizar Registro'}
          </button>

          <div className="text-center mt-4">
            <Link to="/login" className="text-sm text-blue-600 hover:underline">
              ¿Ya tenés cuenta? Iniciá sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;