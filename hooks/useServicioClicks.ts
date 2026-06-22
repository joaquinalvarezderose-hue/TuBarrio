import { supabase } from '../services/supabaseClient';

type TipoEvento = 'profile_view' | 'whatsapp_click';

export async function logServicioClick(
  servicio: { id: string; titulo: string },
  tipoEvento: TipoEvento,
): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  let userNombre: string | null = null;
  if (userId) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', userId)
      .single();
    userNombre = perfil?.nombre_completo ?? null;
  }

  const { error } = await supabase.from('servicio_clicks' as 'marketplace_servicios').insert({
    servicio_id: servicio.id,
    servicio_titulo: servicio.titulo,
    user_id: userId,
    user_nombre: userNombre,
    tipo_evento: tipoEvento,
  } as never);
  if (error) console.error('[servicio_clicks] Error al registrar evento:', error);
}
