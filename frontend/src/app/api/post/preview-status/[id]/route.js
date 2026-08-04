import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/posts/preview-status/${id}`;

        const response = await fetch(engineUrl, {
            headers: { 'x-engine-secret': process.env.ENGINE_API_SECRET },
            cache: 'no-store'
        });

        if (!response.ok) {
            return NextResponse.json({ status: 'not_found' }, { status: 404 });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (err) {
        console.error('[Preview Status] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
