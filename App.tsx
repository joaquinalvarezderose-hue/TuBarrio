
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Register from './screens/Register';
import Login from './screens/Login';
import Services from './screens/Services';
import Profile from './screens/Profile';
import Navigation from './components/Navigation';

const AppContent: React.FC<{ user: boolean }> = ({ user }) => {
  const location = useLocation();
  const hideNavigation = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100 w-full overflow-hidden">
      {!hideNavigation && <Navigation />}
      
      <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto">
        <Routes>
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/register" replace />} />
          <Route path="/register" element={<Register onComplete={() => {}} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/services" element={<Services />} />
          <Route path="/profile" element={<Profile />} />
          {/* Agregá acá el resto de tus rutas siguiendo el mismo formato */}
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const user = !!localStorage.getItem('app_user');

  return (
    <Router>
      <AppContent user={user} />
    </Router>
  );
};

export default App;