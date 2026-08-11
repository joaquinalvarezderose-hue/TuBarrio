
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Navigation from './components/Navigation';
import InstallPrompt from './components/InstallPrompt';
import { SkeletonCard } from './components/Skeleton';
import { useCurrentUser } from './hooks/useCurrentUser';
import { supabase } from './services/supabaseClient';
import type { PendingIntent } from './types/intent';

// Todas las pantallas salvo Dashboard (la ruta "/") se cargan bajo demanda:
// cada visitante nuevo solo debe bajar el codigo de la pantalla que realmente
// va a ver, no las ~15k lineas combinadas de todas las pantallas de la app
// (algunas, como MatchResult/TournamentPanel/CoordinarPartido, son enormes y
// las usa una minoria de usuarios en un momento dado).
const Register = lazy(() => import('./screens/Register'));
const Login = lazy(() => import('./screens/Login'));
const ResetPassword = lazy(() => import('./screens/ResetPassword'));
const Services = lazy(() => import('./screens/Services'));
const ServiceDetail = lazy(() => import('./screens/ServiceDetail'));
const RecommendProfessional = lazy(() => import('./screens/RecommendProfessional'));
const Tournaments = lazy(() => import('./screens/Tournaments'));
const TournamentDetails = lazy(() => import('./screens/TournamentDetails'));
const TournamentPanel = lazy(() => import('./screens/TournamentPanel'));
const Fixture = lazy(() => import('./screens/Fixture'));
const Standings = lazy(() => import('./screens/Standings'));
const MatchResult = lazy(() => import('./screens/MatchResult'));
const ResultDetail = lazy(() => import('./screens/ResultDetail'));
const Rules = lazy(() => import('./screens/Rules'));
const Profile = lazy(() => import('./screens/Profile'));
const Domicilio = lazy(() => import('./screens/Domicilio'));
const Payment = lazy(() => import('./screens/Payment'));
const Confirmation = lazy(() => import('./screens/Confirmation'));
const Ayuda = lazy(() => import('./screens/Ayuda'));
const TermsAndConditions = lazy(() => import('./screens/TermsAndConditions'));
const CompleteProfile = lazy(() => import('./screens/CompleteProfile'));
const CoordinarPartido = lazy(() => import('./screens/CoordinarPartido'));
const Welcome = lazy(() => import('./screens/Welcome'));

// Admin/organizador y modulo de golf: pantallas grandes, visitadas por una
// minoria de usuarios (admins/organizadores, o solo durante torneos de golf).
// Se cargan bajo demanda para no incluir su peso (ademas de Leaflet/Turf, en
// el caso de golf) en el bundle principal que descarga todo el mundo.
const AdminPanel = lazy(() => import('./screens/AdminPanel'));
const AdminPartidos = lazy(() => import('./screens/AdminPartidos'));
const OrganizadorPanel = lazy(() => import('./screens/OrganizadorPanel'));
const OrganizadorTorneoForm = lazy(() => import('./screens/OrganizadorTorneoForm'));
const OrganizadorTorneoDetail = lazy(() => import('./screens/OrganizadorTorneoDetail'));
const GolfCanchaForm = lazy(() => import('./screens/golf/GolfCanchaForm'));
const GolfTorneoForm = lazy(() => import('./screens/golf/GolfTorneoForm'));
const GolfPanel = lazy(() => import('./screens/golf/GolfPanel'));
const GolfFlights = lazy(() => import('./screens/golf/GolfFlights'));
const GolfScorecard = lazy(() => import('./screens/golf/GolfScorecard'));
const GolfTarjetaCompleta = lazy(() => import('./screens/golf/GolfTarjetaCompleta'));
const GolfLeaderboard = lazy(() => import('./screens/golf/GolfLeaderboard'));
const GolfRules = lazy(() => import('./screens/golf/GolfRules'));

const RouteFallback: React.FC = () => (
  <div className="p-4 max-w-3xl mx-auto w-full space-y-4">
    <SkeletonCard />
    <SkeletonCard />
  </div>
);

interface AppContentProps {
  user: boolean;
  setUser: React.Dispatch<React.SetStateAction<boolean>>;
  pendingRecovery: boolean;
  authUser: ReturnType<typeof useCurrentUser>['authUser'];
  perfil: ReturnType<typeof useCurrentUser>['perfil'];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  React.useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll('main').forEach((el) => {
      (el as HTMLElement).scrollTop = 0;
    });
  }, [pathname]);
  return null;
};

const AppContent: React.FC<AppContentProps> = ({ user, setUser, pendingRecovery, authUser, perfil, loading, refresh }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNavigation =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset-password' ||
    location.pathname === '/welcome' ||
    location.pathname === '/terms' ||
    location.pathname === '/complete-profile' ||
    location.pathname === '/coordinar-partido';

  // Handle pending_intent after OAuth redirect (Google login) + enforce complete profile
  React.useEffect(() => {
    if (loading || !authUser) return;
    if (pendingRecovery) return;
    if (location.pathname === '/complete-profile') return;
    // Register.tsx maneja su propia navegación post-registro (incluyendo un refresh()
    // explícito del perfil antes de navegar) — evita que este guard dispare una
    // redirección prematura a /complete-profile mientras el registro sigue en curso.
    if (location.pathname === '/register') return;

    const raw = localStorage.getItem('pending_intent');
    let intent: PendingIntent | undefined;
    if (raw) {
      try {
        intent = JSON.parse(raw) as PendingIntent;
        localStorage.removeItem('pending_intent');
      } catch {
        localStorage.removeItem('pending_intent');
      }
    }

    // Redirect to complete-profile whenever whatsapp or domicilio is missing,
    // regardless of whether the user came from a pending intent (covers Google OAuth flow).
    if (!perfil?.whatsapp || !perfil?.calle) {
      navigate('/complete-profile', { state: intent ? { intent } : undefined });
      return;
    }

    if (intent?.type === 'tournament-signup') {
      navigate('/payment', { state: { tournament: intent.payload.tournament } });
    } else if (intent?.type === 'service-hire') {
      navigate(`/service/${intent.payload.serviceId}`);
    }
  }, [authUser, loading, perfil, location.pathname, pendingRecovery]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 w-full overflow-hidden">
      <ScrollToTop />
      {!hideNavigation && <Navigation />}

      <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Root: Dashboard for everyone (guest mode supported), recovery redirect takes priority */}
          <Route path="/" element={pendingRecovery ? <Navigate to="/reset-password" replace /> : <Dashboard />} />
          <Route path="/welcome" element={!user ? <Welcome /> : <Navigate to="/" replace />} />
          <Route path="/register" element={<Register onComplete={() => setUser(true)} refresh={refresh} />} />
          <Route path="/login" element={<Login onSuccess={() => setUser(true)} />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/complete-profile" element={<CompleteProfile onSaved={refresh} />} />

          {/* Public routes — no auth required */}
          <Route path="/services" element={<Services />} />
          <Route path="/service/:id" element={user ? <ServiceDetail /> : <Navigate to="/login" replace />} />
          <Route path="/recomendar-profesional" element={user ? <RecommendProfessional /> : <Navigate to="/login" replace />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournament-details" element={<TournamentDetails />} />
          <Route path="/fixture" element={<Fixture />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/ayuda" element={<Ayuda />} />
          <Route path="/terms" element={<TermsAndConditions />} />

          {/* Protected routes — require auth */}
          <Route path="/tournament-panel" element={user ? <TournamentPanel /> : <Navigate to="/login" replace />} />
          <Route path="/coordinar-partido" element={user ? <CoordinarPartido /> : <Navigate to="/login" replace />} />
          <Route path="/match-result" element={user ? <MatchResult /> : <Navigate to="/login" replace />} />
          <Route path="/result-detail" element={user ? <ResultDetail /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/domicilio" element={user ? <Domicilio /> : <Navigate to="/login" replace />} />
          <Route path="/payment" element={user ? <Payment /> : <Navigate to="/login" replace />} />
          <Route path="/confirmation" element={user ? <Confirmation /> : <Navigate to="/login" replace />} />
          <Route path="/admin" element={user ? <AdminPanel /> : <Navigate to="/login" replace />} />
          <Route path="/admin/partidos" element={user ? <AdminPartidos /> : <Navigate to="/login" replace />} />
          <Route path="/organizador" element={user ? <OrganizadorPanel /> : <Navigate to="/login" replace />} />
          <Route path="/organizador/torneos/nuevo" element={user ? <OrganizadorTorneoForm /> : <Navigate to="/login" replace />} />
          <Route path="/organizador/torneos/:id/editar" element={user ? <OrganizadorTorneoForm /> : <Navigate to="/login" replace />} />
          <Route path="/organizador/torneos/:id" element={user ? <OrganizadorTorneoDetail /> : <Navigate to="/login" replace />} />

          {/* Modulo de Golf */}
          <Route path="/golf/canchas" element={user ? <GolfCanchaForm /> : <Navigate to="/login" replace />} />
          <Route path="/golf/organizador/nuevo" element={user ? <GolfTorneoForm /> : <Navigate to="/login" replace />} />
          <Route path="/golf/panel" element={user ? <GolfPanel /> : <Navigate to="/login" replace />} />
          <Route path="/golf/flights" element={user ? <GolfFlights /> : <Navigate to="/login" replace />} />
          <Route path="/golf/scorecard" element={user ? <GolfScorecard /> : <Navigate to="/login" replace />} />
          <Route path="/golf/tarjeta-completa" element={user ? <GolfTarjetaCompleta /> : <Navigate to="/login" replace />} />
          <Route path="/golf/leaderboard" element={user ? <GolfLeaderboard /> : <Navigate to="/login" replace />} />
          <Route path="/golf/hoyo" element={<Navigate to="/golf/scorecard" replace />} />
          <Route path="/golf/rules" element={user ? <GolfRules /> : <Navigate to="/login" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const { authUser, perfil, loading, refresh } = useCurrentUser();
  const [overrideUser, setOverrideUser] = React.useState<boolean>(false);
  const [pendingRecovery, setPendingRecovery] = React.useState(false);

  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPendingRecovery(true);
      } else if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        setPendingRecovery(false);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const user = !!authUser || overrideUser;

  if (loading && !overrideUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white font-display select-none">
        {/* Logo con fade-in + escala suave */}
        <div
          className="flex flex-col items-center gap-6"
          style={{ animation: 'tb-fadein 0.5s ease both' }}
        >
          <img
            src="/logos/logo-primary.png"
            alt="TuBarrio"
            className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-md"
            draggable={false}
          />

          <div className="flex flex-col items-center gap-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#111813]">
              TuBarrio
            </h1>
            <p className="text-sm md:text-base text-secondary-text">Tu comunidad, tu espacio</p>
          </div>

          {/* Dots bouncing */}
          <div className="flex items-center gap-2 mt-2">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="block w-2.5 h-2.5 rounded-full bg-primary"
                style={{ animation: `tb-bounce 0.9s ease-in-out ${delay}ms infinite` }}
              />
            ))}
          </div>
        </div>

        <style>{`
          @keyframes tb-fadein {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes tb-bounce {
            0%, 100% { transform: translateY(0);    opacity: 0.4; }
            50%       { transform: translateY(-8px); opacity: 1;   }
          }
        `}</style>
      </div>
    );
  }

  return (
    <Router>
      <AppContent
        user={user}
        setUser={setOverrideUser}
        pendingRecovery={pendingRecovery}
        authUser={authUser}
        perfil={perfil}
        loading={loading}
        refresh={refresh}
      />
      <InstallPrompt />
    </Router>
  );
};

export default App;
