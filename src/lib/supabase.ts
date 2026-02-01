import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Este "export" es obligatorio para que los demás archivos lo vean
export const supabase = createClient(supabaseUrl, supabaseAnonKey)