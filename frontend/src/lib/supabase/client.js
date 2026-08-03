import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://nozklukqqjgrebufgpoq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vemtsdWtxcWpncmVidWZncG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTUxNDUsImV4cCI6MjA4NzY5MTE0NX0.9wAppPY6VuMigytiRd37ZMx9bctYPh4tWd6lvUNamdw';

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
    );
}
