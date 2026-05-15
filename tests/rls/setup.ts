import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_TEST_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_TEST_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Configurá un branch de prueba de Supabase.',
  );
}

export interface TestUser {
  client: SupabaseClient<Database>;
  user: { id: string; email: string };
}

export async function signInAs(email: string, password: string): Promise<TestUser> {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`No se pudo loguear ${email}: ${error.message}`);
  if (!data.user) throw new Error(`Sin user para ${email}`);
  return { client, user: { id: data.user.id, email: data.user.email ?? email } };
}

export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}
