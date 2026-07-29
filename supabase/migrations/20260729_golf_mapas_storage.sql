-- ============================================================
-- Mapas de hoyo (SVG/PNG/JPG) en Storage privado.
--
-- Requisito: los mapas NO pueden ser publicos. Solo deben verlos
-- quienes participan (inscripcion pagado_aprobado) de algun torneo
-- que usa esa cancha, o quien administra ese torneo, o un admin.
--
-- Convencion de path dentro del bucket: "{cancha_id}/{hoyo_id}.ext"
-- (cancha_id/hoyo_id son los IDs reales de public.canchas/public.hoyos,
-- por eso el mapa se sube DESPUES de crear la cancha, no en el alta).
-- hoyos.mapa_url pasa a guardar ese path relativo, no una URL publica.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'golf-mapas',
  'golf-mapas',
  false,
  2097152, -- 2 MB
  ARRAY['image/svg+xml', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lectura: admin, quien administra algun torneo que usa esa cancha,
-- o jugador con inscripcion aprobada en algun torneo que usa esa cancha.
DROP POLICY IF EXISTS golf_mapas_select_participantes ON storage.objects;
CREATE POLICY golf_mapas_select_participantes
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'golf-mapas'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.torneo_golf_config c
      WHERE c.cancha_id::text = (storage.foldername(name))[1]
        AND public.puede_administrar_torneo(c.torneo_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.torneo_golf_config c
      JOIN public.inscripciones_torneo i ON i.torneo_id = c.torneo_id
      WHERE c.cancha_id::text = (storage.foldername(name))[1]
        AND i.perfil_id = auth.uid()
        AND i.estado = 'pagado_aprobado'
    )
  )
);

-- Escritura: solo admin (misma regla que INSERT/UPDATE/DELETE de canchas/hoyos).
DROP POLICY IF EXISTS golf_mapas_insert_admin ON storage.objects;
CREATE POLICY golf_mapas_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'golf-mapas' AND public.is_admin());

DROP POLICY IF EXISTS golf_mapas_update_admin ON storage.objects;
CREATE POLICY golf_mapas_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'golf-mapas' AND public.is_admin())
WITH CHECK (bucket_id = 'golf-mapas' AND public.is_admin());

DROP POLICY IF EXISTS golf_mapas_delete_admin ON storage.objects;
CREATE POLICY golf_mapas_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'golf-mapas' AND public.is_admin());
