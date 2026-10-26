import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dppvlphuctpdszumnllc.supabase.co'
const supabasePublishableKey = 'sb_publishable_7pl_sabI8HUQ0kNYgZYZ_g_WONIhxrd'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
