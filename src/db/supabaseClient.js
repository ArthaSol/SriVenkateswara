// src/db/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// ⚠️ REPLACE THESE WITH YOUR ACTUAL SUPABASE URL AND KEY
const supabaseUrl = 'https://pwgeppfxgxdpgzfoulfn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3Z2VwcGZ4Z3hkcGd6Zm91bGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MjEyNzUsImV4cCI6MjA4NzI5NzI3NX0.pzV5TE7_FHMojQDulCnyN40ig2DBKzCaENubdzXKlUs';

export const supabase = createClient(supabaseUrl, supabaseKey);