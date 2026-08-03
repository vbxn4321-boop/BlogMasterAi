import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://nozklukqqjgrebufgpoq.supabase.co';

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-for-build';
    return createClient(url, key);
}

export async function POST(req) {
    try {
        const { email } = await req.json();
        if (!email) return Response.json({ error: 'email required' }, { status: 400 });

        const supabaseAdmin = getSupabaseAdmin();
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ exists: !!data });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
