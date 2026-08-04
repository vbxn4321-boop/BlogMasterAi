import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const account_id = searchParams.get('account_id');
        if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/recommendations?account_id=${account_id}&user_id=${user.id}`;

        const response = await fetch(engineUrl, {
            headers: { 'x-engine-secret': process.env.ENGINE_API_SECRET }
        });

        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
