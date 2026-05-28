
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import Payment from './screens/Payment';
import Confirmation from './screens/Confirmation';
import AdminPanel from './screens/AdminPanel';
import Ayuda from './screens/Ayuda';
import TermsAndConditions from './screens/TermsAndConditions';
import Navigation from './components/Navigation';
import Welcome from './screens/Welcome';
import { useCurrentUser } from './hooks/useCurrentUser';
import { supabase } from './services/supabaseClient';

interface AppContentProps {
  user: boolean;
  setUser: React.Dispatch<React.SetStateAction<boolean>>;
  pendingRecovery: boolean;
}

const AppContent: React.FC<AppContentProps> = ({ user, setUser, pendingRecovery }) => {
  const location = useLocation();
  const hideNavigation = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/reset-password' || location.pathname === '/welcome' || location.pathname === '/terms';


  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 w-full overflow-hidden">
      {!hideNavigation && <Navigation />}
      
      <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto">
        <Routes>
          <Route path="/" element={pendingRecovery ? <Navigate to="/reset-password" replace /> : (user ? <Dashboard /> : <Navigate to="/welcome" replace />)} />
          <Route path="/welcome" element={!user ? <Welcome /> : <Navigate to="/" replace />} />
          <Route path="/register" element={<Register onComplete={() => setUser(true)} />} />
          <Route path="/login" element={<Login onSuccess={() => setUser(true)} />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/services" element={user ? <Services /> : <Navigate to="/login" replace />} />
          <Route path="/service/:id" element={user ? <ServiceDetail /> : <Navigate to="/login" replace />} />
          <Route path="/recomendar-profesional" element={user ? <RecommendProfessional /> : <Navigate to="/login" replace />} />
          <Route path="/tournaments" element={user ? <Tournaments /> : <Navigate to="/login" replace />} />
          <Route path="/tournament-details" element={user ? <TournamentDetails /> : <Navigate to="/login" replace />} />
          <Route path="/tournament-panel" element={user ? <TournamentPanel /> : <Navigate to="/login" replace />} />
          <Route path="/fixture" element={user ? <Fixture /> : <Navigate to="/login" replace />} />
          <Route path="/standings" element={user ? <Standings /> : <Navigate to="/login" replace />} />
          <Route path="/match-result" element={user ? <MatchResult /> : <Navigate to="/login" replace />} />
          <Route path="/result-detail" element={user ? <ResultDetail /> : <Navigate to="/login" replace />} />
          <Route path="/rules" element={user ? <Rules /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/payment" element={user ? <Payment /> : <Navigate to="/login" replace />} />
          <Route path="/confirmation" element={user ? <Confirmation /> : <Navigate to="/login" replace />} />
          <Route path="/admin" element={user ? <AdminPanel /> : <Navigate to="/login" replace />} />
          <Route path="/ayuda" element={user ? <Ayuda /> : <Navigate to="/login" replace />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          {/* Agregá acá el resto de tus rutas siguiendo el mismo formato */}
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const { authUser, loading } = useCurrentUser();
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
      <AppContent user={user} setUser={setOverrideUser} pendingRecovery={pendingRecovery} />
    </Router>
  );
};

export default App;