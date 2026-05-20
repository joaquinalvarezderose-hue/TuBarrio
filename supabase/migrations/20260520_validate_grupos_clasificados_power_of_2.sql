-- Valida que numero_grupos * clasificados_por_grupo sea potencia de 2
-- cuando crear_playoffs_eliminacion_directa = true y numero_grupos está seteado.
-- Fecha: 2026-05-20

create or replace function public.chk_grupos_clasificados_potencia_de_2()
returns trigger
language plpgsql
as $$
declare
  v_grupos integer;
  v_clasificados integer;
  v_total integer;
begin
  -- Solo aplica cuando los playoffs de eliminacion directa están habilitados
  if not coalesce(NEW.crear_playoffs_eliminacion_directa, false) then
    return NEW;
  end if;

  -- Solo aplica cuando numero_grupos está seteado explicitamente
  -- (si es NULL, los grupos se calculan al momento del sorteo y no podemos validar acá)
  if NEW.numero_grupos is null then
    return NEW;
  end if;

  v_grupos      := NEW.numero_grupos;
  v_clasificados := coalesce(NEW.clasificados_por_grupo, 2);
  v_total       := v_grupos * v_clasificados;

  -- Chequeo de potencia de 2: n > 0 AND (n & (n-1)) = 0
  if v_total <= 0 or (v_total & (v_total - 1)) <> 0 then
    raise exception
      'Configuracion invalida: % grupos x % clasificados = % jugadores en playoffs. '
      'El total debe ser potencia de 2 (2, 4, 8, 16, 32...). '
      'Ejemplos validos: 2x2=4, 4x2=8, 2x4=8, 8x2=16.',
      v_grupos, v_clasificados, v_total;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_chk_grupos_clasificados_potencia_de_2 on public.torneo_configuracion;
create trigger trg_chk_grupos_clasificados_potencia_de_2
  before insert or update on public.torneo_configuracion
  for each row
  execute function public.chk_grupos_clasificados_potencia_de_2();
