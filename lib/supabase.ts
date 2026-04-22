import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedBrowserClient: SupabaseClient | null = null;

const createBrowserClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL para inicializar Supabase en cliente.');
  }

  if (!supabaseKey) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY para inicializar Supabase en cliente.');
  }

  return createClient(supabaseUrl, supabaseKey);
};

export const getSupabase = () => {
  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient();
  }

  return cachedBrowserClient;
};

// Delay client creation until runtime so static prerendering does not fail
// in environments where the public Supabase env vars are not available.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabase();
    const value = Reflect.get(client, property, client);

    return typeof value === 'function' ? value.bind(client) : value;
  }
});
