// Tipos generados automáticamente desde el schema de Supabase.
// NO editar manualmente. Regenerar con:
//   npx supabase gen types typescript --project-id bpgyqjfysapldrlnsoty --schema public > types/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      inscripciones_torneo: {
        Row: {
          alias_destino: string
          aprobado_en: string | null
          aprobado_por: string | null
          categoria: string | null
          comprobante_url: string | null
          created_at: string
          estado: string
          grupo: string | null
          id: string
          metodo_pago: string
          moneda: string
          monto: number
          nombre_contacto: string | null
          perfil_id: string
          referencia_manual: string | null
          torneo_id: number
          updated_at: string
          whatsapp_contacto: string | null
          whatsapp_destino: string
        }
        Insert: {
          alias_destino: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          categoria?: string | null
          comprobante_url?: string | null
          created_at?: string
          estado?: string
          grupo?: string | null
          id?: string
          metodo_pago?: string
          moneda?: string
          monto: number
          nombre_contacto?: string | null
          perfil_id: string
          referencia_manual?: string | null
          torneo_id: number
          updated_at?: string
          whatsapp_contacto?: string | null
          whatsapp_destino: string
        }
        Update: {
          alias_destino?: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          categoria?: string | null
          comprobante_url?: string | null
          created_at?: string
          estado?: string
          grupo?: string | null
          id?: string
          metodo_pago?: string
          moneda?: string
          monto?: number
          nombre_contacto?: string | null
          perfil_id?: string
          referencia_manual?: string | null
          torneo_id?: number
          updated_at?: string
          whatsapp_contacto?: string | null
          whatsapp_destino?: string
        }
        Relationships: []
      }
      valoraciones_servicios: {
        Row: {
          id: string
          servicio_id: string
          usuario_id: string
          puntuacion: number
          comentario: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          servicio_id: string
          usuario_id: string
          puntuacion: number
          comentario?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          servicio_id?: string
          usuario_id?: string
          puntuacion?: number
          comentario?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recomendaciones_servicios: {
        Row: {
          id: string
          usuario_id: string
          nombre_proveedor: string
          rubro: string
          telefono: string
          motivo: string | null
          estado: string
          created_at: string | null
        }
        Insert: {
          id?: string
          usuario_id: string
          nombre_proveedor: string
          rubro: string
          telefono: string
          motivo?: string | null
          estado?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          usuario_id?: string
          nombre_proveedor?: string
          rubro?: string
          telefono?: string
          motivo?: string | null
          estado?: string
          created_at?: string | null
        }
        Relationships: []
      }
      marketplace_servicios: {
        Row: {
          categoria: string | null
          contacto_email: string | null
          contacto_whatsapp: string | null
          created_at: string | null
          descripcion: string | null
          estado: string | null
          id: string
          imagen_url: string | null
          precio: number | null
          proveedor_id: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          contacto_email?: string | null
          contacto_whatsapp?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          id?: string
          imagen_url?: string | null
          precio?: number | null
          proveedor_id?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          contacto_email?: string | null
          contacto_whatsapp?: string | null
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          id?: string
          imagen_url?: string | null
          precio?: number | null
          proveedor_id?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      partidos: {
        Row: {
          bracket_tipo: string | null
          categoria: string | null
          confirmado_por: string | null
          created_at: string | null
          estado: string | null
          external_match_key: string | null
          fecha_programada: string | null
          ganador_id: string | null
          grupo: string | null
          id: string
          jornada: number
          jugador1_id: string | null
          jugador2_id: string | null
          posicion_bracket: number | null
          resultado: string | null
          resultado_jugador1: number | null
          resultado_jugador2: number | null
          ronda: number | null
          set1_j1: number | null
          set1_j2: number | null
          set2_j1: number | null
          set2_j2: number | null
          set3_j1: number | null
          set3_j2: number | null
          sets_jugador1: number | null
          sets_jugador2: number | null
          siguiente_partido_id: string | null
          stage_name: string | null
          torneo_id: number
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["partidos"]["Row"]> & { torneo_id: number }
        Update: Partial<Database["public"]["Tables"]["partidos"]["Row"]>
        Relationships: []
      }
      perfiles: {
        Row: {
          barrio: string | null
          calle: string | null
          created_at: string | null
          direccion: string | null
          email: string | null
          id: string
          localidad: string | null
          lote: string | null
          nombre_completo: string | null
          numero_altura: string | null
          rol: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["perfiles"]["Row"]> & { id: string }
        Update: Partial<Database["public"]["Tables"]["perfiles"]["Row"]>
        Relationships: []
      }
      torneo_configuracion: {
        Row: {
          categoria: string | null
          clasificados_por_grupo: number
          crear_playoffs_eliminacion_directa: boolean
          created_at: string | null
          formato: string | null
          grupo_base: string | null
          grupo_base_id: string | null
          grupos_cantidad: number | null
          id: string
          jugadores_por_grupo: number | null
          max_participantes_por_grupo: number | null
          max_participantes_total: number | null
          min_participantes_por_grupo: number | null
          numero_grupos: number | null
          partidos_por_jugador: number | null
          sortear_grupos_en_sorteo: boolean
          torneo_id: number
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_configuracion"]["Row"]> & { torneo_id: number }
        Update: Partial<Database["public"]["Tables"]["torneo_configuracion"]["Row"]>
        Relationships: []
      }
      torneo_estado: {
        Row: {
          categoria: string
          created_at: string | null
          current_participantes: number | null
          estado: string | null
          grupo: string
          id: number
          sorteo_realizado: boolean
          torneo_id: number
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_estado"]["Row"]> & { torneo_id: number }
        Update: Partial<Database["public"]["Tables"]["torneo_estado"]["Row"]>
        Relationships: []
      }
      torneo_grupos: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string | null
          es_base: boolean
          fase: string
          grupo_base_id: string | null
          grupo_padre_id: string | null
          id: string
          nombre: string | null
          orden: number
          torneo_id: number
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_grupos"]["Row"]> & { torneo_id: number }
        Update: Partial<Database["public"]["Tables"]["torneo_grupos"]["Row"]>
        Relationships: []
      }
      torneo_jugadores: {
        Row: {
          categoria: string | null
          created_at: string | null
          grupo: string | null
          id: string
          partidos_jugados: number | null
          perfil_id: string
          puntos: number | null
          sets_ganados: number | null
          sets_perdidos: number
          torneo_id: number
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_jugadores"]["Row"]> & { perfil_id: string; torneo_id: number }
        Update: Partial<Database["public"]["Tables"]["torneo_jugadores"]["Row"]>
        Relationships: []
      }
      torneo_partidos_historial: {
        Row: {
          cargado_en: string | null
          cargado_por_perfil_id: string | null
          categoria: string | null
          external_match_key: string | null
          fecha_registro: string | null
          ganador_id: string | null
          ganador_perfil_id: string | null
          grupo: string | null
          id: string
          jugador1_id: string
          jugador1_perfil_id: string | null
          jugador2_id: string
          jugador2_perfil_id: string | null
          partido_id: string
          puntos_jugador1: number | null
          puntos_jugador2: number | null
          registrado_por: string | null
          resultado_jugador1: number | null
          resultado_jugador2: number | null
          ronda: number | null
          sets_json: Json | null
          sets_jugador1: number | null
          sets_jugador2: number | null
          stage_name: string | null
          torneo_id: number
          torneo_titulo: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_partidos_historial"]["Row"]> & {
          jugador1_id: string
          jugador2_id: string
          partido_id: string
          torneo_id: number
        }
        Update: Partial<Database["public"]["Tables"]["torneo_partidos_historial"]["Row"]>
        Relationships: []
      }
      torneo_propuestas_partido: {
        Row: {
          created_at: string | null
          debe_confirmar_por: string | null
          estado: string | null
          fecha_propuesta: string
          fecha_respuesta: string | null
          id: string
          jornada: number | null
          jugador1_id: string
          jugador1_perfil_id: string | null
          jugador2_id: string
          jugador2_perfil_id: string | null
          match_pair_key: string | null
          mensaje_propuesta: string | null
          mensaje_respuesta: string | null
          partido_id: string | null
          propuesta_por: string
          respuesta_por: string | null
          sets_json_j1: Json | null
          sets_json_j2: Json | null
          torneo_id: number
          ultimo_cargado_por: string | null
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneo_propuestas_partido"]["Row"]> & {
          fecha_propuesta: string
          jugador1_id: string
          jugador2_id: string
          propuesta_por: string
          torneo_id: number
        }
        Update: Partial<Database["public"]["Tables"]["torneo_propuestas_partido"]["Row"]>
        Relationships: []
      }
      torneos: {
        Row: {
          activo: boolean
          created_at: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: number
          imagen_url: string | null
          subtitulo: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["torneos"]["Row"]> & { titulo: string }
        Update: Partial<Database["public"]["Tables"]["torneos"]["Row"]>
        Relationships: []
      }
    }
    Views: {
      v_servicios_con_stats: {
        Row: {
          id: string
          titulo: string
          descripcion: string | null
          categoria: string | null
          precio: number | null
          proveedor_id: string | null
          contacto_email: string | null
          contacto_whatsapp: string | null
          imagen_url: string | null
          estado: string | null
          created_at: string | null
          updated_at: string | null
          proveedor_nombre: string | null
          promedio_rating: number
          total_valoraciones: number
        }
        Relationships: []
      }
    }
    Functions: {
      calcular_stage_name: { Args: { p_ronda: number; p_torneo_id: number }; Returns: string }
      calculate_stage_name: { Args: { p_ronda: number; p_torneo_id: number }; Returns: string }
      debug_stage_names: {
        Args: { p_torneo_id: number }
        Returns: {
          bracket_tipo: string
          partido_id: string
          ronda: number
          stage_name_actual: string
          stage_name_calculado: string
        }[]
      }
      enviar_resultado_seguro: {
        Args: {
          p_partido_id: string
          p_set1_j1: number
          p_set1_j2: number
          p_set2_j1: number
          p_set2_j2: number
          p_set3_j1?: number
          p_set3_j2?: number
          p_user_id: string
        }
        Returns: string
      }
      generar_fixture_round_robin_grupo: {
        Args: { p_categoria: string; p_grupo: string; p_torneo_id: number }
        Returns: number
      }
      generar_playoffs_al_finalizar_grupos: {
        Args: { p_categoria?: string; p_grupo?: string; p_torneo_id: number }
        Returns: undefined
      }
      generar_playoffs_eliminacion_directa_torneo: {
        Args: { p_categoria?: string; p_grupo_base?: string; p_torneo_id: number }
        Returns: {
          clasificados_totales: number
          grupo_playoffs: string
          grupos_fuente: number
          out_categoria: string
          partidos_creados: number
        }[]
      }
      iniciar_torneo_en_curso: {
        Args: { p_categoria?: string; p_grupo_base?: string; p_torneo_id: number }
        Returns: {
          categoria: string
          grupo_base: string
          grupos_actualizados: number
          partidos_creados: number
          torneo_id: number
        }[]
      }
      iniciar_torneo_manual: {
        Args: {
          p_categoria: string
          p_grupo: string
          p_inicio?: string
          p_minutos_entre_partidos?: number
          p_torneo_id: number
        }
        Returns: {
          categoria: string
          estado_antes: string
          estado_despues: string
          grupo: string
          inicio_aplicado: string
          partidos_programados: number
          torneo_id: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      obtener_estadisticas_historicas_jugador: { Args: { p_perfil_id: string }; Returns: Json }
      obtener_estado_jugador_torneo: { Args: { p_perfil_id: string; p_torneo_id: number }; Returns: Json }
      registrar_participante_y_sortear_si_lleno: {
        Args: {
          p_categoria: string
          p_grupo: string
          p_max_participantes: number
          p_perfil_id: string
          p_torneo_id: number
        }
        Returns: {
          byes: string[]
          estado_antes: string
          estado_despues: string
          participantes_actuales: number
          partidos_creados: number
          perfil_id: string
          sorteo_disparado: boolean
          torneo_id: number
          ya_inscripto: boolean
        }[]
      }
      reparar_bracket_existente: { Args: { p_categoria: string; p_torneo_id: number }; Returns: string }
      reset_password_test_user: { Args: { p_email: string }; Returns: string }
      resolver_grupo_base_torneo: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_grupo_base_id?: string
          p_torneo_id: number
        }
        Returns: {
          grupo_codigo: string
          grupo_id: string
          grupo_nombre: string
        }[]
      }
      resolver_grupo_inscripcion: {
        Args: {
          p_categoria: string
          p_grupo_base: string
          p_max_participantes: number
          p_torneo_id: number
        }
        Returns: string
      }
      sortear_grupos_y_fixture_torneo: {
        Args: { p_categoria?: string; p_grupo_base?: string; p_torneo_id: number }
        Returns: {
          categoria: string
          grupo_base: string
          grupos_creados: number
          jugadores_por_grupo: number
          jugadores_sorteados: number
          partidos_creados: number
        }[]
      }
      upsert_torneo_grupo: {
        Args: {
          p_categoria: string
          p_codigo: string
          p_es_base?: boolean
          p_fase?: string
          p_grupo_padre_id?: string
          p_nombre?: string
          p_orden?: number
          p_torneo_id: number
        }
        Returns: string
      }
      validar_resultado_seguro: {
        Args: { p_accion: string; p_partido_id: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
