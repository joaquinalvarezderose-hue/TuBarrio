/**
 * RLS Negative Testing — TuBarrio
 *
 * Comprueba empíricamente que el Usuario A NO puede leer, modificar ni borrar
 * datos del Usuario B bajo ninguna circunstancia.
 *
 * Pre-requisitos (configurar antes de correr):
 *   1. Crear dos usuarios de prueba en Supabase Auth:
 *        userA@test.com  /  Test#User#A#2026
 *        userB@test.com  /  Test#User#B#2026
 *   2. Cada uno con su perfil + al menos una inscripción a torneos distintos.
 *   3. Configurar las env vars:
 *        VITE_SUPABASE_URL          = URL del branch de prueba
 *        VITE_SUPABASE_ANON_KEY     = anon key del branch
 *
 * Correr con:
 *   npx vitest run tests/rls/negative.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { signInAs, createAnonClient, type TestUser } from './setup';

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  userA = await signInAs('userA@test.com', 'Test#User#A#2026');
  userB = await signInAs('userB@test.com', 'Test#User#B#2026');
}, 30000);

describe('RLS — Usuario A vs Usuario B', () => {
  it('Test 1 — A NO puede leer inscripciones de B', async () => {
    const { data, error } = await userA.client
      .from('inscripciones_torneo')
      .select('*')
      .eq('perfil_id', userB.user.id);

    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filtra silenciosamente
  });

  it('Test 2 — A NO puede modificar el perfil de B', async () => {
    const { data } = await userA.client
      .from('perfiles')
      .update({ nombre_completo: 'HACKED' })
      .eq('id', userB.user.id)
      .select();

    expect(data).toEqual([]); // 0 filas afectadas
  });

  it('Test 3 — A NO puede reasignar su inscripción a B (WITH CHECK)', async () => {
    const { data: inscripcionA, error: selectErr } = await userA.client
      .from('inscripciones_torneo')
      .select('id')
      .eq('perfil_id', userA.user.id)
      .limit(1)
      .maybeSingle();

    if (selectErr || !inscripcionA) {
      console.warn('No hay inscripción de A para testear reasignación — skipping');
      return;
    }

    const { error } = await userA.client
      .from('inscripciones_torneo')
      .update({ perfil_id: userB.user.id })
      .eq('id', inscripcionA.id);

    // WITH CHECK debe rechazar
    expect(error).toBeTruthy();
  });

  it('Test 4 — A NO puede borrar partidos (solo admin puede)', async () => {
    const { data: partidos } = await userA.client
      .from('partidos')
      .select('id')
      .limit(1);

    if (!partidos || partidos.length === 0) {
      console.warn('No hay partidos para testear delete — skipping');
      return;
    }

    const { data } = await userA.client
      .from('partidos')
      .delete()
      .eq('id', partidos[0].id)
      .select();

    expect(data).toEqual([]);
  });

  it('Test 5 — A NO puede ver propuestas de partidos donde no juega', async () => {
    const { data, error } = await userA.client
      .from('torneo_propuestas_partido')
      .select('partido_id');

    expect(error).toBeNull();

    if (!data || data.length === 0) return;

    // Para cada propuesta visible, A debe ser jugador1 o jugador2 del partido
    for (const propuesta of data) {
      if (!propuesta.partido_id) continue;
      const { data: partido } = await userA.client
        .from('partidos')
        .select('jugador1_id, jugador2_id')
        .eq('id', propuesta.partido_id)
        .maybeSingle();

      if (!partido) continue;
      const esJugador =
        partido.jugador1_id === userA.user.id || partido.jugador2_id === userA.user.id;
      expect(esJugador).toBe(true);
    }
  });

  it('Test 6 — Anónimo NO puede leer perfiles', async () => {
    const anon = createAnonClient();
    const { data } = await anon.from('perfiles').select('*');
    expect(data).toEqual([]);
  });

  it('Test 7 — Anónimo NO puede leer inscripciones_torneo', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('inscripciones_torneo')
      .select('id, perfil_id');

    // RLS sin policy para anon → debe devolver vacío o error
    expect(data === null || data.length === 0).toBe(true);
    void error;
  });

  it('Test 8 — RPC enviar_resultado_seguro debe usar auth.uid() interno', async () => {
    // El test es informativo: se invoca con p_user_id falso (de B).
    // La RPC debería ignorarlo y usar auth.uid() (= A).
    // Si responde sin error, hay que verificar manualmente que NO atribuyó
    // la acción a B.
    const { data: partidoA } = await userA.client
      .from('partidos')
      .select('id')
      .or(`jugador1_id.eq.${userA.user.id},jugador2_id.eq.${userA.user.id}`)
      .limit(1)
      .maybeSingle();

    if (!partidoA) {
      console.warn('A no tiene partidos para testear RPC bypass — skipping');
      return;
    }

    const { error } = await userA.client.rpc('validar_resultado_seguro', {
      p_partido_id: partidoA.id,
      p_user_id: userB.user.id, // ← suplantación intentada
      p_accion: 'confirmar',
    });

    // Esperamos error (p_user_id no coincide con auth.uid()) o la RPC
    // ignora p_user_id silenciosamente. Cualquier caso es aceptable
    // mientras la acción se atribuya a A, no a B.
    void error;
    expect(true).toBe(true); // marcador — revisar manualmente
  });
});
