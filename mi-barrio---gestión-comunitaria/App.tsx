
import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Register from './screens/Register';
import Services from './screens/Services';
import Profile from './screens/Profile';
import Tournaments from './screens/Tournaments';
import TournamentDetails from './screens/TournamentDetails';
import PlayerProfile from './screens/PlayerProfile';
import TournamentPanel from './screens/TournamentPanel';
import Fixture from './screens/Fixture';
import Standings from './screens/Standings';
import Rules from './screens/Rules';
import MatchResult from './screens/MatchResult';
import Payment from './screens/Payment';
import Confirmation from './screens/Confirmation';
import Navigation from './components/Navigation';

const App: React.FC = () => {
  return (
    <Router>
      <div className="flex flex-col md:flex-row min-h-screen bg-background-light dark:bg-background-dark w-full text-slate-900 dark:text-white overflow-hidden">
        {/* Navigation Sidebar/BottomBar */}
        <Navigation />
        
        {/* Main Content Area */}
        <main className="flex-1 relative w-full h-[calc(100vh-64px)] md:h-screen overflow-y-auto no-scrollbar md:scrollbar-thin">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/register" element={<Register onComplete={() => {}} />} />
            <Route path="/services" element={<Services />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournament-details" element={<TournamentDetails />} />
            <Route path="/player-profile" element={<PlayerProfile />} />
            <Route path="/tournament-panel" element={<TournamentPanel />} />
            <Route path="/fixture" element={<Fixture />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/match-result" element={<MatchResult />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/confirmation" element={<Confirmation />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
