import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/billing/cancel`;

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ user_id: user.id })
        });

        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
