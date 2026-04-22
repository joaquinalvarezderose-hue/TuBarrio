import React, { useState, useEffect } from 'react';

interface BracketTabProps {
  torneo_id: number;
  categoria: string;
  grupo?: string;
  selectedGroup?: string;
}

const BracketTab: React.FC<BracketTabProps> = ({ torneo_id, categoria, grupo, selectedGroup }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Format tournament name to remove backend prefixes
  const formatTournamentName = (name: string) => {
    if (!name) return 'Torneo';
    // Remove common backend prefixes
    return name.replace(/TORNEO_\d+_?/i, '').replace(/_/g, ' ').trim() || 'Torneo';
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

  return (
    <div className="rounded-xl bg-[#e8f6eb] dark:bg-[#1a3a22] p-8 shadow-sm border border-[#dbe6de] dark:border-[#2a5a32] text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#dbe6de] dark:bg-[#2a5a32] flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl text-[#61896b]">sports_tennis</span>
        </div>
        <div className="text-center max-w-md">
          <h3 className="text-lg font-bold text-[#111813] dark:text-white mb-3">
            Llaves no disponibles
          </h3>
          <p className="text-sm text-[#61896b] leading-relaxed">
            Las llaves de eliminación directa aún no han sido generadas para este torneo.
            <br />
            Se crearán automáticamente cuando finalice la fase de grupos.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-xs text-[#61896b] w-full max-w-sm">
          <div className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">schedule</span>
            <span>Las llaves se generarán cuando todos los grupos finalicen</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">groups</span>
            <span>Los mejores jugadores de cada grupo clasificarán</span>
          </div>
        </div>
        <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg w-full max-w-sm">
          <p className="text-xs text-[#61896b] text-center">
            <strong>Torneo:</strong> {formatTournamentName(categoria)} {grupo && `- ${grupo}`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BracketTab;
