-- Hardening de seguridad: tablas y vista del marketplace de servicios
--
-- Problemas que resuelve:
--   1. Vista v_servicios_con_stats aparecía como "UNRESTRICTED" en Supabase porque
--      le faltaba security_invoker = true, bypasseando RLS en las tablas subyacentes.
--   2. Rol anon tenía INSERT/UPDATE/DELETE/TRUNCATE en tablas de servicios.
--   3. Rol authenticated tenía TRUNCATE/TRIGGER/REFERENCES innecesarios.
--   4. Sin índices en FKs de valoraciones_servicios → joins lentos.

-- ── 1. Fix crítico: security_invoker en la vista ─────────────────────────────
-- Sin esto, la vista corre con permisos de postgres (owner) y bypasea RLS.
ALTER VIEW public.v_servicios_con_stats SET (security_invoker = true);

-- ── 2. Limpiar grants actuales ───────────────────────────────────────────────
REVOKE ALL ON public.marketplace_servicios  FROM anon, authenticated;
REVOKE ALL ON public.valoraciones_servicios FROM anon, authenticated;
REVOKE ALL ON public.v_servicios_con_stats  FROM anon, authenticated;

-- ── 3. Re-grant con mínimo privilegio ───────────────────────────────────────
-- Tablas: solo authenticated, solo DML necesario
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_servicios  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valoraciones_servicios TO authenticated;

-- Vista: solo lectura, solo authenticated (anon no accede al marketplace)
GRANT SELECT ON public.v_servicios_con_stats TO authenticated;

-- ── 4. Índices en foreign keys ───────────────────────────────────────────────
-- PostgreSQL no crea índices automáticos en columnas que referencian otras tablas.
CREATE INDEX IF NOT EXISTS idx_valoraciones_servicio_id
  ON public.valoraciones_servicios (servicio_id);

CREATE INDEX IF NOT EXISTS idx_valoraciones_usuario_id
  ON public.valoraciones_servicios (usuario_id);

CREATE INDEX IF NOT EXISTS idx_servicios_proveedor_id
  ON public.marketplace_servicios (proveedor_id);

CREATE INDEX IF NOT EXISTS idx_servicios_estado
  ON public.marketplace_servicios (estado);
