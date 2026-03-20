
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Register from './screens/Register';
import Login from './screens/Login';
import Services from './screens/Services';
import Profile from './screens/Profile';
import Navigation from './components/Navigation';

interface AppContentProps {
  user: boolean;
  setUser: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContent: React.FC<AppContentProps> = ({ user, setUser }) => {
  const location = useLocation();
  const hideNavigation = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 w-full overflow-hidden">
      {!hideNavigation && <Navigation />}
      
      <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto">
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/register" replace />} />
          <Route path="/register" element={<Register onComplete={() => setUser(true)} />} />
          <Route path="/login" element={<Login onSuccess={() => setUser(true)} />} />
          <Route path="/services" element={user ? <Services /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          {/* Agregá acá el resto de tus rutas siguiendo el mismo formato */}
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = React.useState<boolean>(!!localStorage.getItem('app_user'));

  return (
    <Router>
      <AppContent user={user} setUser={setUser} />
    </Router>
  );
};

export default App;