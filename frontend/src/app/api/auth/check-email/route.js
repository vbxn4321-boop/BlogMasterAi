import { createClient } from '@supabase/supabase-js';

// service_role 키는 서버사이드에서만 사용 (클라이언트에 노출 안 됨)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
    try {
        const { email } = await req.json();
        if (!email) return Response.json({ error: 'email required' }, { status: 400 });

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
