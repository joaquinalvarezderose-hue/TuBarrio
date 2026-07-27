export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
        Relationships: [
          {
            foreignKeyName: "inscripciones_torneo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "inscripciones_torneo_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "marketplace_servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      partido_disponibilidad: {
        Row: {
          created_at: string
          id: string
          partido_id: string
          perfil_id: string
          slots: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          partido_id: string
          perfil_id: string
          slots?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          partido_id?: string
          perfil_id?: string
          slots?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partido_disponibilidad_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partido_disponibilidad_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "partido_disponibilidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partido_disponibilidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      partidos: {
        Row: {
          bracket_tipo: string | null
          categoria: string | null
          confirmado_automaticamente: boolean
          confirmado_por: string | null
          created_at: string | null
          equipo_ganador_id: string | null
          equipo1_id: string | null
          equipo2_id: string | null
          es_wo: boolean
          estado: string | null
          estado_coordinacion: string
          external_match_key: string | null
          fecha_programada: string | null
          ganador_id: string | null
          grupo: string | null
          horario_pactado: string | null
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
        Insert: {
          bracket_tipo?: string | null
          categoria?: string | null
          confirmado_automaticamente?: boolean
          confirmado_por?: string | null
          created_at?: string | null
          equipo_ganador_id?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          es_wo?: boolean
          estado?: string | null
          estado_coordinacion?: string
          external_match_key?: string | null
          fecha_programada?: string | null
          ganador_id?: string | null
          grupo?: string | null
          horario_pactado?: string | null
          id?: string
          jornada?: number
          jugador1_id?: string | null
          jugador2_id?: string | null
          posicion_bracket?: number | null
          resultado?: string | null
          resultado_jugador1?: number | null
          resultado_jugador2?: number | null
          ronda?: number | null
          set1_j1?: number | null
          set1_j2?: number | null
          set2_j1?: number | null
          set2_j2?: number | null
          set3_j1?: number | null
          set3_j2?: number | null
          sets_jugador1?: number | null
          sets_jugador2?: number | null
          siguiente_partido_id?: string | null
          stage_name?: string | null
          torneo_id: number
          updated_at?: string | null
        }
        Update: {
          bracket_tipo?: string | null
          categoria?: string | null
          confirmado_automaticamente?: boolean
          confirmado_por?: string | null
          created_at?: string | null
          equipo_ganador_id?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          es_wo?: boolean
          estado?: string | null
          estado_coordinacion?: string
          external_match_key?: string | null
          fecha_programada?: string | null
          ganador_id?: string | null
          grupo?: string | null
          horario_pactado?: string | null
          id?: string
          jornada?: number
          jugador1_id?: string | null
          jugador2_id?: string | null
          posicion_bracket?: number | null
          resultado?: string | null
          resultado_jugador1?: number | null
          resultado_jugador2?: number | null
          ronda?: number | null
          set1_j1?: number | null
          set1_j2?: number | null
          set2_j1?: number | null
          set2_j2?: number | null
          set3_j1?: number | null
          set3_j2?: number | null
          sets_jugador1?: number | null
          sets_jugador2?: number | null
          siguiente_partido_id?: string | null
          stage_name?: string | null
          torneo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_partidos_siguiente"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_partidos_siguiente"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "partidos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_equipo_ganador_id_fkey"
            columns: ["equipo_ganador_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_equipo1_id_fkey"
            columns: ["equipo1_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_equipo2_id_fkey"
            columns: ["equipo2_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_siguiente_partido_id_fkey"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_siguiente_partido_id_fkey"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "partidos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "partidos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      perfiles: {
        Row: {
          barrio: string | null
          calle: string | null
          created_at: string | null
          email: string | null
          id: string
          localidad: string | null
          lote: string | null
          nombre_completo: string | null
          numero_altura: string | null
          rol: string | null
          sector: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          barrio?: string | null
          calle?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          localidad?: string | null
          lote?: string | null
          nombre_completo?: string | null
          numero_altura?: string | null
          rol?: string | null
          sector?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          barrio?: string | null
          calle?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          localidad?: string | null
          lote?: string | null
          nombre_completo?: string | null
          numero_altura?: string | null
          rol?: string | null
          sector?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      pwa_installs: {
        Row: {
          id: string
          installed_at: string
          platform: string
          user_agent: string | null
          user_id: string | null
          user_nombre: string | null
        }
        Insert: {
          id?: string
          installed_at?: string
          platform: string
          user_agent?: string | null
          user_id?: string | null
          user_nombre?: string | null
        }
        Update: {
          id?: string
          installed_at?: string
          platform?: string
          user_agent?: string | null
          user_id?: string | null
          user_nombre?: string | null
        }
        Relationships: []
      }
      recomendaciones_servicios: {
        Row: {
          created_at: string | null
          estado: string
          id: string
          motivo: string | null
          nombre_proveedor: string
          rubro: string
          telefono: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          estado?: string
          id?: string
          motivo?: string | null
          nombre_proveedor: string
          rubro: string
          telefono: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          estado?: string
          id?: string
          motivo?: string | null
          nombre_proveedor?: string
          rubro?: string
          telefono?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recomendaciones_servicios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recomendaciones_servicios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicio_clicks: {
        Row: {
          clicked_at: string
          id: string
          servicio_id: string
          servicio_titulo: string
          tipo_evento: string
          user_id: string | null
          user_nombre: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          servicio_id: string
          servicio_titulo: string
          tipo_evento: string
          user_id?: string | null
          user_nombre?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          servicio_id?: string
          servicio_titulo?: string
          tipo_evento?: string
          user_id?: string | null
          user_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicio_clicks_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "marketplace_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_clicks_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "v_servicios_con_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_clicks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_clicks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_clicks: {
        Row: {
          clicked_at: string
          id: string
          sponsor_id: string
          sponsor_name: string
          user_id: string | null
          user_nombre: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          sponsor_id: string
          sponsor_name: string
          user_id?: string | null
          user_nombre?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          sponsor_id?: string
          sponsor_name?: string
          user_id?: string | null
          user_nombre?: string | null
        }
        Relationships: []
      }
      torneo_configuracion: {
        Row: {
          cantidad_mejores_terceros: number | null
          categoria: string | null
          clasificados_por_grupo: number
          crear_playoffs_eliminacion_directa: boolean
          created_at: string | null
          ejecutar_sorteo: boolean
          formato: string | null
          grupo_base: string | null
          grupo_base_id: string | null
          id: string
          incluir_mejores_terceros: boolean
          inscriptos_aprobados: number
          max_participantes_por_grupo: number | null
          max_participantes_total: number | null
          min_participantes_por_grupo: number | null
          modalidad: string
          numero_grupos: number | null
          pendientes_revision: number
          torneo_id: number
          updated_at: string | null
        }
        Insert: {
          cantidad_mejores_terceros?: number | null
          categoria?: string | null
          clasificados_por_grupo?: number
          crear_playoffs_eliminacion_directa?: boolean
          created_at?: string | null
          ejecutar_sorteo?: boolean
          formato?: string | null
          grupo_base?: string | null
          grupo_base_id?: string | null
          id?: string
          incluir_mejores_terceros?: boolean
          inscriptos_aprobados?: number
          max_participantes_por_grupo?: number | null
          max_participantes_total?: number | null
          min_participantes_por_grupo?: number | null
          modalidad?: string
          numero_grupos?: number | null
          pendientes_revision?: number
          torneo_id: number
          updated_at?: string | null
        }
        Update: {
          cantidad_mejores_terceros?: number | null
          categoria?: string | null
          clasificados_por_grupo?: number
          crear_playoffs_eliminacion_directa?: boolean
          created_at?: string | null
          ejecutar_sorteo?: boolean
          formato?: string | null
          grupo_base?: string | null
          grupo_base_id?: string | null
          id?: string
          incluir_mejores_terceros?: boolean
          inscriptos_aprobados?: number
          max_participantes_por_grupo?: number | null
          max_participantes_total?: number | null
          min_participantes_por_grupo?: number | null
          modalidad?: string
          numero_grupos?: number | null
          pendientes_revision?: number
          torneo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_configuracion_grupo_base_id_fkey"
            columns: ["grupo_base_id"]
            isOneToOne: false
            referencedRelation: "torneo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_configuracion_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: true
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_configuracion_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: true
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_configuracion_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: true
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneo_equipos: {
        Row: {
          categoria: string
          creado_por: string | null
          created_at: string
          games_ganados: number
          games_perdidos: number
          grupo: string | null
          id: string
          jugador1_id: string
          jugador2_id: string
          partidos_jugados: number
          puntos: number
          sets_ganados: number
          sets_perdidos: number
          torneo_id: number
          updated_at: string
        }
        Insert: {
          categoria: string
          creado_por?: string | null
          created_at?: string
          games_ganados?: number
          games_perdidos?: number
          grupo?: string | null
          id?: string
          jugador1_id: string
          jugador2_id: string
          partidos_jugados?: number
          puntos?: number
          sets_ganados?: number
          sets_perdidos?: number
          torneo_id: number
          updated_at?: string
        }
        Update: {
          categoria?: string
          creado_por?: string | null
          created_at?: string
          games_ganados?: number
          games_perdidos?: number
          grupo?: string | null
          id?: string
          jugador1_id?: string
          jugador2_id?: string
          partidos_jugados?: number
          puntos?: number
          sets_ganados?: number
          sets_perdidos?: number
          torneo_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "torneo_equipos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_equipos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_equipos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneo_estado: {
        Row: {
          campeon_perfil_id: string | null
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
        Insert: {
          campeon_perfil_id?: string | null
          categoria?: string
          created_at?: string | null
          current_participantes?: number | null
          estado?: string | null
          grupo?: string
          id?: number
          sorteo_realizado?: boolean
          torneo_id: number
          updated_at?: string | null
        }
        Update: {
          campeon_perfil_id?: string | null
          categoria?: string
          created_at?: string | null
          current_participantes?: number | null
          estado?: string | null
          grupo?: string
          id?: number
          sorteo_realizado?: boolean
          torneo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_estado_campeon_perfil_id_fkey"
            columns: ["campeon_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_estado_campeon_perfil_id_fkey"
            columns: ["campeon_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_estado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_estado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_estado_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
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
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          es_base?: boolean
          fase?: string
          grupo_base_id?: string | null
          grupo_padre_id?: string | null
          id?: string
          nombre?: string | null
          orden?: number
          torneo_id: number
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          es_base?: boolean
          fase?: string
          grupo_base_id?: string | null
          grupo_padre_id?: string | null
          id?: string
          nombre?: string | null
          orden?: number
          torneo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_grupos_grupo_base_id_fkey"
            columns: ["grupo_base_id"]
            isOneToOne: false
            referencedRelation: "torneo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_grupos_grupo_padre_id_fkey"
            columns: ["grupo_padre_id"]
            isOneToOne: false
            referencedRelation: "torneo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_grupos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_grupos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_grupos_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneo_jugadores: {
        Row: {
          categoria: string | null
          created_at: string | null
          games_ganados: number
          games_perdidos: number
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
        Insert: {
          categoria?: string | null
          created_at?: string | null
          games_ganados?: number
          games_perdidos?: number
          grupo?: string | null
          id?: string
          partidos_jugados?: number | null
          perfil_id: string
          puntos?: number | null
          sets_ganados?: number | null
          sets_perdidos?: number
          torneo_id: number
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          games_ganados?: number
          games_perdidos?: number
          grupo?: string | null
          id?: string
          partidos_jugados?: number | null
          perfil_id?: string
          puntos?: number | null
          sets_ganados?: number | null
          sets_perdidos?: number
          torneo_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_jugadores_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_jugadores_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_jugadores_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_jugadores_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_jugadores_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneo_partidos_historial: {
        Row: {
          cargado_en: string | null
          cargado_por_perfil_id: string | null
          categoria: string | null
          equipo_ganador_id: string | null
          equipo1_id: string | null
          equipo2_id: string | null
          es_wo: boolean
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
        Insert: {
          cargado_en?: string | null
          cargado_por_perfil_id?: string | null
          categoria?: string | null
          equipo_ganador_id?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          es_wo?: boolean
          external_match_key?: string | null
          fecha_registro?: string | null
          ganador_id?: string | null
          ganador_perfil_id?: string | null
          grupo?: string | null
          id?: string
          jugador1_id: string
          jugador1_perfil_id?: string | null
          jugador2_id: string
          jugador2_perfil_id?: string | null
          partido_id: string
          puntos_jugador1?: number | null
          puntos_jugador2?: number | null
          registrado_por?: string | null
          resultado_jugador1?: number | null
          resultado_jugador2?: number | null
          ronda?: number | null
          sets_json?: Json | null
          sets_jugador1?: number | null
          sets_jugador2?: number | null
          stage_name?: string | null
          torneo_id: number
          torneo_titulo?: string | null
        }
        Update: {
          cargado_en?: string | null
          cargado_por_perfil_id?: string | null
          categoria?: string | null
          equipo_ganador_id?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          es_wo?: boolean
          external_match_key?: string | null
          fecha_registro?: string | null
          ganador_id?: string | null
          ganador_perfil_id?: string | null
          grupo?: string | null
          id?: string
          jugador1_id?: string
          jugador1_perfil_id?: string | null
          jugador2_id?: string
          jugador2_perfil_id?: string | null
          partido_id?: string
          puntos_jugador1?: number | null
          puntos_jugador2?: number | null
          registrado_por?: string | null
          resultado_jugador1?: number | null
          resultado_jugador2?: number | null
          ronda?: number | null
          sets_json?: Json | null
          sets_jugador1?: number | null
          sets_jugador2?: number | null
          stage_name?: string | null
          torneo_id?: number
          torneo_titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_partidos_historial_equipo_ganador_id_fkey"
            columns: ["equipo_ganador_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_equipo1_id_fkey"
            columns: ["equipo1_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_equipo2_id_fkey"
            columns: ["equipo2_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: true
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: true
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_partidos_historial_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneo_propuestas_partido: {
        Row: {
          categoria: string
          confirmado_automaticamente: boolean
          created_at: string | null
          debe_confirmar_equipo_id: string | null
          debe_confirmar_por: string | null
          equipo1_id: string | null
          equipo2_id: string | null
          estado: string | null
          fecha_propuesta: string
          fecha_respuesta: string | null
          grupo: string | null
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
        Insert: {
          categoria?: string
          confirmado_automaticamente?: boolean
          created_at?: string | null
          debe_confirmar_equipo_id?: string | null
          debe_confirmar_por?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          estado?: string | null
          fecha_propuesta: string
          fecha_respuesta?: string | null
          grupo?: string | null
          id?: string
          jornada?: number | null
          jugador1_id: string
          jugador1_perfil_id?: string | null
          jugador2_id: string
          jugador2_perfil_id?: string | null
          match_pair_key?: string | null
          mensaje_propuesta?: string | null
          mensaje_respuesta?: string | null
          partido_id?: string | null
          propuesta_por: string
          respuesta_por?: string | null
          sets_json_j1?: Json | null
          sets_json_j2?: Json | null
          torneo_id: number
          ultimo_cargado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          confirmado_automaticamente?: boolean
          created_at?: string | null
          debe_confirmar_equipo_id?: string | null
          debe_confirmar_por?: string | null
          equipo1_id?: string | null
          equipo2_id?: string | null
          estado?: string | null
          fecha_propuesta?: string
          fecha_respuesta?: string | null
          grupo?: string | null
          id?: string
          jornada?: number | null
          jugador1_id?: string
          jugador1_perfil_id?: string | null
          jugador2_id?: string
          jugador2_perfil_id?: string | null
          match_pair_key?: string | null
          mensaje_propuesta?: string | null
          mensaje_respuesta?: string | null
          partido_id?: string | null
          propuesta_por?: string
          respuesta_por?: string | null
          sets_json_j1?: Json | null
          sets_json_j2?: Json | null
          torneo_id?: number
          ultimo_cargado_por?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_propuestas_partido_debe_confirmar_equipo_id_fkey"
            columns: ["debe_confirmar_equipo_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_debe_confirmar_por_fkey"
            columns: ["debe_confirmar_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_debe_confirmar_por_fkey"
            columns: ["debe_confirmar_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_equipo1_id_fkey"
            columns: ["equipo1_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_equipo2_id_fkey"
            columns: ["equipo2_id"]
            isOneToOne: false
            referencedRelation: "torneo_equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_propuesta_por_fkey"
            columns: ["propuesta_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_respuesta_por_fkey"
            columns: ["respuesta_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_respuesta_por_fkey"
            columns: ["respuesta_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      torneos: {
        Row: {
          activo: boolean
          alias_pago: string | null
          cancelado: boolean
          creado_por: string | null
          created_at: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: number
          imagen_url: string | null
          subtitulo: string | null
          titulo: string
          updated_at: string | null
          whatsapp_pago: string | null
        }
        Insert: {
          activo?: boolean
          alias_pago?: string | null
          cancelado?: boolean
          creado_por?: string | null
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: number
          imagen_url?: string | null
          subtitulo?: string | null
          titulo: string
          updated_at?: string | null
          whatsapp_pago?: string | null
        }
        Update: {
          activo?: boolean
          alias_pago?: string | null
          cancelado?: boolean
          creado_por?: string | null
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: number
          imagen_url?: string | null
          subtitulo?: string | null
          titulo?: string
          updated_at?: string | null
          whatsapp_pago?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      valoraciones_servicios: {
        Row: {
          comentario: string | null
          created_at: string | null
          id: string
          puntuacion: number
          servicio_id: string
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          puntuacion: number
          servicio_id: string
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string | null
          id?: string
          puntuacion?: number
          servicio_id?: string
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valoraciones_servicios_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "marketplace_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_servicios_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "v_servicios_con_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_servicios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_servicios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      perfiles_publicos: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          nombre_completo: string | null
          rol: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          email?: never
          id?: string | null
          nombre_completo?: string | null
          rol?: string | null
          whatsapp?: never
        }
        Update: {
          created_at?: string | null
          email?: never
          id?: string | null
          nombre_completo?: string | null
          rol?: string | null
          whatsapp?: never
        }
        Relationships: []
      }
      ranking_categorias_view: {
        Row: {
          categoria: string | null
          derrotas: number | null
          nombre_completo: string | null
          partidos_jugados: number | null
          perfil_id: string | null
          posicion: number | null
          puntos: number | null
          victorias: number | null
        }
        Relationships: []
      }
      v_admin_disputas_activas: {
        Row: {
          bracket_tipo: string | null
          categoria: string | null
          created_at: string | null
          debe_confirmar_nombre: string | null
          debe_confirmar_por: string | null
          estado: string | null
          grupo: string | null
          horas_pendiente: number | null
          jugador1_id: string | null
          jugador1_nombre: string | null
          jugador2_id: string | null
          jugador2_nombre: string | null
          partido_id: string | null
          propuesta_id: string | null
          ronda: number | null
          sets_json_j1: Json | null
          sets_json_j2: Json | null
          stage_name: string | null
          torneo_id: number | null
          torneo_titulo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_propuestas_partido_debe_confirmar_por_fkey"
            columns: ["debe_confirmar_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_debe_confirmar_por_fkey"
            columns: ["debe_confirmar_por"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_grupos_posiciones"
            referencedColumns: ["torneo_id"]
          },
          {
            foreignKeyName: "torneo_propuestas_partido_torneo_id_fkey"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      v_admin_grupos_posiciones: {
        Row: {
          categoria: string | null
          dif_sets: number | null
          estado_grupo: string | null
          grupo: string | null
          jugador_nombre: string | null
          jugador_whatsapp: string | null
          perfil_id: string | null
          pj: number | null
          posicion: number | null
          puntos: number | null
          sg: number | null
          sorteo_realizado: boolean | null
          sp: number | null
          torneo_id: number | null
          torneo_titulo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "torneo_jugadores_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "torneo_jugadores_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_admin_llaves_playoffs: {
        Row: {
          categoria: string | null
          estado: string | null
          ganador_id: string | null
          ganador_nombre: string | null
          grupo: string | null
          jugador1_id: string | null
          jugador1_nombre: string | null
          jugador1_whatsapp: string | null
          jugador2_id: string | null
          jugador2_nombre: string | null
          jugador2_whatsapp: string | null
          partido_id: string | null
          posicion_bracket: number | null
          resultado: string | null
          ronda: number | null
          set1_j1: number | null
          set1_j2: number | null
          set2_j1: number | null
          set2_j2: number | null
          set3_j1: number | null
          set3_j2: number | null
          siguiente_partido_id: string | null
          stage_name: string | null
          torneo_id: number | null
          torneo_titulo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_partidos_siguiente"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_partidos_siguiente"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
          {
            foreignKeyName: "partidos_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_ganador_id_fkey"
            columns: ["ganador_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador1_id_fkey"
            columns: ["jugador1_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_jugador2_id_fkey"
            columns: ["jugador2_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_siguiente_partido_id_fkey"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidos_siguiente_partido_id_fkey"
            columns: ["siguiente_partido_id"]
            isOneToOne: false
            referencedRelation: "v_admin_llaves_playoffs"
            referencedColumns: ["partido_id"]
          },
        ]
      }
      v_servicios_con_stats: {
        Row: {
          categoria: string | null
          contacto_email: string | null
          contacto_whatsapp: string | null
          created_at: string | null
          descripcion: string | null
          estado: string | null
          id: string | null
          imagen_url: string | null
          precio: number | null
          promedio_rating: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          titulo: string | null
          total_valoraciones: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _confirmar_resultado_core: {
        Args: { p_automatico?: boolean; p_partido_id: string }
        Returns: string
      }
      _confirmar_resultado_equipo_core: {
        Args: { p_automatico?: boolean; p_partido_id: string }
        Returns: string
      }
      actualizar_configuracion_torneo: {
        Args: {
          p_cantidad_mejores_terceros?: number
          p_clasificados_por_grupo?: number
          p_crear_playoffs_eliminacion_directa?: boolean
          p_fecha_fin?: string
          p_fecha_inicio?: string
          p_imagen_url?: string
          p_incluir_mejores_terceros?: boolean
          p_max_participantes_por_grupo?: number
          p_max_participantes_total?: number
          p_min_participantes_por_grupo?: number
          p_numero_grupos?: number
          p_subtitulo?: string
          p_titulo?: string
          p_torneo_id: number
        }
        Returns: undefined
      }
      add_users_to_tournament_group: {
        Args: {
          p_grupo: string
          p_torneo_id: number
          p_username_22?: string
          p_username_23?: string
        }
        Returns: {
          message: string
          participantes_actuales: number
          partidos_creados: number
          success: boolean
        }[]
      }
      admin_forzar_resultado_partido: {
        Args: {
          p_ganador_id: string
          p_motivo?: string
          p_partido_id: string
          p_sets_json: Json
        }
        Returns: string
      }
      admin_marcar_wo: {
        Args: { p_ganador_id: string; p_partido_id: string }
        Returns: string
      }
      admin_marcar_wo_equipo: {
        Args: { p_equipo_ganador_id: string; p_partido_id: string }
        Returns: string
      }
      admin_resetear_disputa: {
        Args: { p_motivo?: string; p_partido_id: string }
        Returns: string
      }
      archivar_torneo: {
        Args: { p_activo: boolean; p_cancelado?: boolean; p_torneo_id: number }
        Returns: undefined
      }
      asignar_rol_organizador: {
        Args: { p_activar: boolean; p_perfil_id: string }
        Returns: undefined
      }
      auto_confirmar_resultados_equipos_vencidos: {
        Args: never
        Returns: number
      }
      auto_confirmar_resultados_vencidos: { Args: never; Returns: number }
      calcular_stage_name: {
        Args: { p_ronda: number; p_torneo_id: number }
        Returns: string
      }
      calculate_stage_name: {
        Args: { p_ronda: number; p_torneo_id: number }
        Returns: string
      }
      confirmar_horario_partido: {
        Args: { p_horario: string; p_partido_id: string }
        Returns: Json
      }
      crear_equipo_dobles: {
        Args: {
          p_categoria: string
          p_jugador1_id: string
          p_jugador2_id: string
          p_torneo_id: number
        }
        Returns: string
      }
      crear_torneo: {
        Args: {
          p_cantidad_mejores_terceros?: number
          p_clasificados_por_grupo?: number
          p_crear_playoffs_eliminacion_directa?: boolean
          p_fecha_fin?: string
          p_fecha_inicio?: string
          p_imagen_url?: string
          p_incluir_mejores_terceros?: boolean
          p_max_participantes_por_grupo?: number
          p_max_participantes_total?: number
          p_min_participantes_por_grupo?: number
          p_modalidad?: string
          p_numero_grupos?: number
          p_subtitulo?: string
          p_titulo: string
        }
        Returns: number
      }
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
      eliminar_equipo_dobles: { Args: { p_equipo_id: string }; Returns: string }
      enviar_resultado_seguro: {
        Args: {
          p_partido_id: string
          p_set1_j1: number
          p_set1_j2: number
          p_set2_j1: number
          p_set2_j2: number
          p_set3_j1: number
          p_set3_j2: number
          p_user_id: string
        }
        Returns: string
      }
      enviar_resultado_seguro_equipo: {
        Args: {
          p_partido_id: string
          p_set1_j1: number
          p_set1_j2: number
          p_set2_j1: number
          p_set2_j2: number
          p_set3_j1: number
          p_set3_j2: number
          p_user_id: string
        }
        Returns: string
      }
      equipo_clasifica_en_fase_grupos: {
        Args: { p_categoria: string; p_equipo_id: string; p_torneo_id: number }
        Returns: boolean
      }
      generar_fixture_round_robin_grupo: {
        Args: { p_categoria: string; p_grupo: string; p_torneo_id: number }
        Returns: number
      }
      generar_fixture_round_robin_grupo_equipos: {
        Args: { p_categoria: string; p_grupo: string; p_torneo_id: number }
        Returns: number
      }
      generar_playoffs_al_finalizar_grupos: {
        Args: { p_categoria?: string; p_grupo?: string; p_torneo_id: number }
        Returns: undefined
      }
      generar_playoffs_eliminacion_directa_equipos_torneo: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_torneo_id: number
        }
        Returns: {
          clasificados_totales: number
          grupo_playoffs: string
          grupos_fuente: number
          out_categoria: string
          partidos_creados: number
        }[]
      }
      generar_playoffs_eliminacion_directa_torneo: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_torneo_id: number
        }
        Returns: {
          clasificados_totales: number
          grupo_playoffs: string
          grupos_fuente: number
          out_categoria: string
          partidos_creados: number
        }[]
      }
      iniciar_torneo_en_curso: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_torneo_id: number
        }
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
      is_organizador: { Args: never; Returns: boolean }
      jugador_clasifica_en_fase_grupos: {
        Args: { p_categoria: string; p_perfil_id: string; p_torneo_id: number }
        Returns: boolean
      }
      obtener_estadisticas_historicas_jugador: {
        Args: { p_perfil_id: string }
        Returns: Json
      }
      obtener_estado_equipo_torneo: {
        Args: { p_perfil_id: string; p_torneo_id: number }
        Returns: Json
      }
      obtener_estado_jugador_torneo: {
        Args: { p_perfil_id: string; p_torneo_id: number }
        Returns: Json
      }
      puede_administrar_torneo: {
        Args: { p_torneo_id: number }
        Returns: boolean
      }
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
      reparar_bracket_existente: {
        Args: { p_categoria: string; p_torneo_id: number }
        Returns: string
      }
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
      set_coordinacion_manual: { Args: { p_partido_id: string }; Returns: Json }
      sortear_grupos_y_fixture_equipos_torneo: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_torneo_id: number
        }
        Returns: {
          categoria: string
          equipos_sorteados: number
          grupo_base: string
          grupos_creados: number
          max_participantes_por_grupo: number
          partidos_creados: number
        }[]
      }
      sortear_grupos_y_fixture_torneo: {
        Args: {
          p_categoria?: string
          p_grupo_base?: string
          p_torneo_id: number
        }
        Returns: {
          categoria: string
          grupo_base: string
          grupos_creados: number
          jugadores_sorteados: number
          max_participantes_por_grupo: number
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
      validar_resultado_seguro_equipo: {
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
