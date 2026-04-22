import React, { useState, useEffect } from 'react';
import { BracketEngine, BracketTournament, BracketMatch, BracketPlayer } from '../utils/bracketEngine';
import { supabase } from '../services/supabaseClient';

interface BracketTabProps {
  torneo_id: number;
  categoria: string;
  grupo?: string;
  selectedGroup?: string;
}

const BracketTab: React.FC<BracketTabProps> = ({ torneo_id, categoria, grupo, selectedGroup }) => {
  const [bracket, setBracket] = useState<BracketTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBracket();
  }, [torneo_id, categoria, selectedGroup]);

  const loadBracket = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const effectiveGroup = selectedGroup || grupo;
      const data = await BracketEngine.getBracketFromDatabase(
        torneo_id,
        categoria,
        effectiveGroup,
        'eliminacion_directa'
      );
      
      setBracket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando bracket');
    } finally {
      setLoading(false);
    }
  };

  const renderEmptyState = () => (
    <div className="rounded-xl bg-[#e8f6eb] dark:bg-[#1a3a22] p-8 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32] text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#dbe6de] dark:bg-[#2a5a32] flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-[#61896b]">sports_tennis</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#111813] dark:text-white mb-2">
            Llaves no disponibles
          </h3>
          <p className="text-sm text-[#61896b] max-w-md">
            Las llaves de eliminación directa aún no han sido generadas para este torneo. 
            Se crearán automáticamente cuando finalice la fase de grupos.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-xs text-[#61896b]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">schedule</span>
            <span>Las llaves se generarán cuando todos los grupos finalicen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">groups</span>
            <span>Los mejores jugadores de cada grupo clasificarán</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMatch = (match: BracketMatch, isCompact: boolean = false) => {
    const isCompleted = match.estado === 'finalizado';
    const isBye = match.is_bye;
    const hasPlayers = match.jugador1_id && match.jugador2_id;

    if (isCompact) {
      return (
        <div
          key={match.id}
          className={`bg-white dark:bg-slate-800 rounded-lg border p-2 text-xs ${
            isCompleted 
              ? 'border-green-200 dark:border-green-800' 
              : isBye
              ? 'border-blue-200 dark:border-blue-800'
              : 'border-gray-200 dark:border-slate-700'
          }`}
        >
          {isBye ? (
            <div className="text-center py-1">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                BYE
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className={`truncate ${
                match.ganador_id === match.jugador1_id 
                  ? 'font-medium text-green-600 dark:text-green-400' 
                  : ''
              }`}>
                {match.jugador1_id || 'TBD'}
              </div>
              <div className="text-center text-gray-500">VS</div>
              <div className={`truncate ${
                match.ganador_id === match.jugador2_id 
                  ? 'font-medium text-green-600 dark:text-green-400' 
                  : ''
              }`}>
                {match.jugador2_id || 'TBD'}
              </div>
              {match.resultado && (
                <div className="text-center text-gray-600 dark:text-gray-400 mt-1">
                  {match.resultado}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={match.id}
        className={`bg-white dark:bg-slate-800 rounded-lg border-2 p-3 cursor-pointer transition-all hover:shadow-lg ${
          isCompleted 
            ? 'border-green-200 dark:border-green-800' 
            : isBye
            ? 'border-blue-200 dark:border-blue-800'
            : 'border-gray-200 dark:border-slate-700 hover:border-[#61896b]/50'
        }`}
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Partido {match.posicion_bracket}
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
              {match.jugador1_id || 'Por definir'}
            </div>
            <div className="text-xs text-center text-gray-500">VS</div>
            <div className={`text-sm p-1 rounded ${
              match.ganador_id === match.jugador2_id 
                ? 'bg-green-100 dark:bg-green-900/30 font-medium' 
                : ''
            }`}>
              {match.jugador2_id || 'Por definir'}
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

  const renderCompactBracket = () => {
    if (!bracket) return null;

    return (
      <div className="space-y-6">
        {/* Tournament Info */}
        <div className="bg-[#e8f6eb] dark:bg-[#1a3a22] rounded-xl p-4 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#111813] dark:text-white">
              LLAVES DE ELIMINACIÓN
            </h3>
            <div className="flex items-center gap-3 text-xs text-[#61896b]">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">groups</span>
                <span>{bracket.jugadores.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">emoji_events</span>
                <span>{bracket.puestos_calificados}</span>
              </div>
              {bracket.byes_asignados > 0 && (
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">skip_next</span>
                  <span>{bracket.byes_asignados}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Round Headers */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {bracket.rondas.map((ronda) => (
              <div key={ronda.ronda} className="flex-shrink-0">
                <div className="text-xs font-bold text-[#61896b] mb-2 text-center">
                  {ronda.nombre}
                </div>
                <div className="flex flex-col gap-2 min-w-[120px]">
                  {ronda.partidos.map((match) => renderMatch(match, true))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Players List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-[#dbe6de] dark:border-slate-700">
          <h4 className="text-sm font-bold text-[#111813] dark:text-white mb-3">
            Participantes
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {bracket.jugadores.map((player) => (
              <div
                key={player.id}
                className="bg-[#e8f6eb] dark:bg-[#1a3a22] rounded-lg p-2 text-center"
              >
                <div className="text-xs font-medium text-[#111813] dark:text-white truncate">
                  {player.name}
                </div>
                {player.seed && (
                  <div className="text-xs text-[#61896b]">
                    #{player.seed}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#61896b] mx-auto mb-2"></div>
          <p className="text-sm text-[#61896b]">Cargando llaves...</p>
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
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={loadBracket}
            className="px-4 py-2 bg-[#61896b] text-white rounded-lg hover:bg-[#4a7c54] text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!bracket) {
    return renderEmptyState();
  }

  return renderCompactBracket();
};

export default BracketTab;
