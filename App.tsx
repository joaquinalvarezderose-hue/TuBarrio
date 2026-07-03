
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Register from './screens/Register';
import Login from './screens/Login';
import ResetPassword from './screens/ResetPassword';
import Services from './screens/Services';
import ServiceDetail from './screens/ServiceDetail';
import RecommendProfessional from './screens/RecommendProfessional';
import Tournaments from './screens/Tournaments';
import TournamentDetails from './screens/TournamentDetails';
import TournamentPanel from './screens/TournamentPanel';
import Fixture from './screens/Fixture';
import Standings from './screens/Standings';
import MatchResult from './screens/MatchResult';
import ResultDetail from './screens/ResultDetail';
import Rules from './screens/Rules';
import Profile from './screens/Profile';
import Domicilio from './screens/Domicilio';
import Payment from './screens/Payment';
import Confirmation from './screens/Confirmation';
import AdminPanel from './screens/AdminPanel';
import Ayuda from './screens/Ayuda';
import TermsAndConditions from './screens/TermsAndConditions';
import CompleteProfile from './screens/CompleteProfile';
import Navigation from './components/Navigation';
import InstallPrompt from './components/InstallPrompt';
import Welcome from './screens/Welcome';
import { useCurrentUser } from './hooks/useCurrentUser';
import { supabase } from './services/supabaseClient';
import type { PendingIntent } from './types/intent';

interface AppContentProps {
  user: boolean;
  setUser: React.Dispatch<React.SetStateAction<boolean>>;
  pendingRecovery: boolean;
  authUser: ReturnType<typeof useCurrentUser>['authUser'];
  perfil: ReturnType<typeof useCurrentUser>['perfil'];
  loading: boolean;
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

const AppContent: React.FC<AppContentProps> = ({ user, setUser, pendingRecovery, authUser, perfil, loading }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNavigation =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset-password' ||
    location.pathname === '/welcome' ||
    location.pathname === '/terms' ||
    location.pathname === '/complete-profile';

  // Handle pending_intent after OAuth redirect (Google login)
  React.useEffect(() => {
    if (loading || !authUser) return;

    const raw = localStorage.getItem('pending_intent');
    if (!raw) return;

    let intent: PendingIntent;
    try {
      intent = JSON.parse(raw) as PendingIntent;
    } catch {
      localStorage.removeItem('pending_intent');
      return;
    }
    localStorage.removeItem('pending_intent');

    if (!perfil?.whatsapp || !perfil?.calle) {
      navigate('/complete-profile', { state: { intent } });
      return;
    }

    if (intent.type === 'tournament-signup') {
      navigate('/payment', { state: { tournament: intent.payload.tournament } });
    } else if (intent.type === 'service-hire') {
      navigate(`/service/${intent.payload.serviceId}`);
    }
  }, [authUser, loading, perfil]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 w-full overflow-hidden">
      <ScrollToTop />
      {!hideNavigation && <Navigation />}

      <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto">
        <Routes>
          {/* Root: Dashboard for everyone (guest mode supported), recovery redirect takes priority */}
          <Route path="/" element={pendingRecovery ? <Navigate to="/reset-password" replace /> : <Dashboard />} />
          <Route path="/welcome" element={!user ? <Welcome /> : <Navigate to="/" replace />} />
          <Route path="/register" element={<Register onComplete={() => setUser(true)} />} />
          <Route path="/login" element={<Login onSuccess={() => setUser(true)} />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />

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
          <Route path="/match-result" element={user ? <MatchResult /> : <Navigate to="/login" replace />} />
          <Route path="/result-detail" element={user ? <ResultDetail /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/domicilio" element={user ? <Domicilio /> : <Navigate to="/login" replace />} />
          <Route path="/payment" element={user ? <Payment /> : <Navigate to="/login" replace />} />
          <Route path="/confirmation" element={user ? <Confirmation /> : <Navigate to="/login" replace />} />
          <Route path="/admin" element={user ? <AdminPanel /> : <Navigate to="/login" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const { authUser, perfil, loading } = useCurrentUser();
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
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-on-surface-variant text-sm">Cargando…</div>
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
      />
      <InstallPrompt />
    </Router>
  );
};

export default App;
