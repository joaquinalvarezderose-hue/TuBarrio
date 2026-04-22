-- ============================================================
-- Add bracket support to partidos table for elimination tournaments
-- ============================================================

-- Add new columns for bracket structure
alter table public.partidos 
add column if not exists ronda integer null,
add column if not exists posicion_bracket integer null,
add column if not exists siguiente_partido_id uuid null,
add column if not exists bracket_tipo text null check (bracket_tipo in ('eliminacion_directa', 'consuelo'));

-- Add indexes for bracket operations
create index if not exists idx_partidos_bracket 
on public.partidos (torneo_id, categoria, grupo, bracket_tipo, ronda, posicion_bracket);

create index if not exists idx_partidos_siguiente 
on public.partidos (siguiente_partido_id);

-- Add foreign key constraint for self-reference
alter table public.partidos 
add constraint fk_partidos_siguiente 
foreign key (siguiente_partido_id) references public.partidos(id) on delete set null;

-- Add comment for documentation
comment on column public.partidos.ronda is 'Round number: 1=Octavos, 2=Cuartos, 3=Semifinal, 4=Final, etc.';
comment on column public.partidos.posicion_bracket is 'Position within the round (1-indexed)';
comment on column public.partidos.siguiente_partido_id is 'Next match winner advances to';
comment on column public.partidos.bracket_tipo is 'Bracket type: main bracket or consolation bracket';
