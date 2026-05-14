import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BracketEngine, BracketTournament, BracketMatch, BracketPlayer } from '../utils/bracketEngine';
import { supabase } from '../services/supabaseClient';

// JSX types for react-jsx transform
declare global {
  namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}


interface BracketViewProps {
  torneo_id: number;
  categoria: string;
  grupo?: string;
}

const BracketView: React.FC<BracketViewProps> = ({ torneo_id, categoria, grupo }) => {
  const navigate = useNavigate();
  const [bracket, setBracket] = useState<BracketTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  useEffect(() => {
    loadBracket();
  }, [torneo_id, categoria, grupo]);

  const loadBracket = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await BracketEngine.getBracketFromDatabase(
        torneo_id,
        categoria,
        grupo,
        'eliminacion_directa'
      );
      
      setBracket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando bracket');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (match: BracketMatch) => {
    if (match.estado === 'programado' && !match.is_bye) {
      setSelectedMatch(match);
    }
  };

  const renderMatch = (match: BracketMatch) => {
    const isCompleted = match.estado === 'finalizado';
    const isBye = match.is_bye;
    const hasPlayers = match.jugador1_id && match.jugador2_id;

    return (
      <div
        key={match.id}
        className={`bg-white dark:bg-slate-800 rounded-lg border-2 p-3 cursor-pointer transition-all hover:shadow-lg ${
          isCompleted 
            ? 'border-green-200 dark:border-green-800' 
            : isBye
            ? 'border-blue-200 dark:border-blue-800'
            : 'border-gray-200 dark:border-slate-700 hover:border-primary/50'
        }`}
        onClick={() => handleMatchClick(match)}
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {match.posicion_bracket}
        </div>
        
        {isBye ? (
          <div className="text-center py-2">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
              BYE
            </div>
            <div className="text-xs text-gray-500">
              {match.jugador1_id || match.jugador2_id}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className={`text-sm p-1 rounded ${
              match.ganador_id === match.jugador1_id
                ? 'bg-green-100 dark:bg-green-900/30 font-medium'
                : ''
            }`}>
              {match.jugador1_id || 'A definir'}
            </div>
            <div className="text-xs text-center text-gray-500">VS</div>
            <div className={`text-sm p-1 rounded ${
              match.ganador_id === match.jugador2_id
                ? 'bg-green-100 dark:bg-green-900/30 font-medium'
                : ''
            }`}>
              {match.jugador2_id || 'A definir'}
            </div>
            {match.resultado && (
              <div className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1">
                {match.resultado}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRound = (roundIndex: number) => {
    if (!bracket) return null;
    
    const round = bracket.rondas[roundIndex];
    const matches = round.partidos;
    
    return (
      <div key={round.ronda} className="flex flex-col space-y-4">
        <h3 className="text-lg font-bold text-center text-gray-800 dark:text-gray-200">
          {round.nombre}
        </h3>
        <div className="flex flex-col space-y-3">
          {matches.map(renderMatch)}
        </div>
      </div>
    );
  };

  const renderConnections = () => {
    if (!bracket) return null;
    
    const connections: JSX.Element[] = [];
    
    bracket.rondas.forEach((round, roundIndex) => {
      if (roundIndex === bracket.rondas.length - 1) return; // No connections after final
      
      round.partidos.forEach((match, matchIndex) => {
        if (match.siguiente_partido_id) {
          const nextRoundIndex = roundIndex + 1;
          const nextMatchIndex = Math.floor(matchIndex / 2);
          
          // Simple visual connection (you might want to use SVG for better visuals)
          connections.push(
            <div
              key={`connection-${match.id}`}
              className="absolute border-t-2 border-gray-300 dark:border-slate-600"
              style={{
                left: `${(roundIndex + 1) * 200 - 50}px`,
                top: `${matchIndex * 80 + 40}px`,
                width: '50px'
              }}
            />
          );
        }
      });
    });
    
    return connections;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando bracket...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-500 mb-2">
            <span className="material-symbols-outlined text-4xl">error</span>
          </div>
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={loadBracket}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!bracket) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No hay bracket generado para este torneo
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
              Bracket de Eliminación Directa
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {categoria} {grupo && `- ${grupo}`}
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </div>
        
        {/* Tournament Info */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Jugadores:</span>
            <span className="font-medium">{bracket.jugadores.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Puestos:</span>
            <span className="font-medium">{bracket.puestos_calificados}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Byes:</span>
            <span className="font-medium">{bracket.byes_asignados}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Rondas:</span>
            <span className="font-medium">{bracket.total_rondas}</span>
          </div>
        </div>
      </div>

      {/* Bracket Visualization */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 overflow-x-auto">
        <div className="relative min-w-max">
          {/* Connections Layer */}
          <div className="absolute inset-0 pointer-events-none">
            {renderConnections()}
          </div>
          
          {/* Rounds Layer */}
          <div className="relative flex gap-8" style={{ minWidth: `${bracket.rondas.length * 250}px` }}>
            {bracket.rondas.map((_, index) => renderRound(index))}
          </div>
        </div>
      </div>

      {/* Players List */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mt-6">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">
          Participantes
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {bracket.jugadores.map((player) => (
            <div
              key={player.id}
              className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 text-center"
            >
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {player.name}
              </div>
              {player.seed && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Seed #{player.seed}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Match Detail Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                Partido - {selectedMatch.posicion_bracket}
              </h3>
              <button
                onClick={() => setSelectedMatch(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Ronda: {bracket.rondas.find(r => r.ronda === selectedMatch.ronda)?.nombre}
              </div>
              
              <div className="space-y-2">
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded">
                  <div className="font-medium">{selectedMatch.jugador1_id || 'Por definir'}</div>
                </div>
                <div className="text-center text-gray-500">VS</div>
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded">
                  <div className="font-medium">{selectedMatch.jugador2_id || 'Por definir'}</div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Navigate to match result page
                    navigate(`/match-result/${selectedMatch.id}`);
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  Cargar Resultado
                </button>
                <button
                  onClick={() => setSelectedMatch(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketView;
