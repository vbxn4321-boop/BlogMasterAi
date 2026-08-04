import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const DEFAULT_SUPABASE_URL = 'https://nozklukqqjgrebufgpoq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vemtsdWtxcWpncmVidWZncG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTUxNDUsImV4cCI6MjA4NzY5MTE0NX0.9wAppPY6VuMigytiRd37ZMx9bctYPh4tWd6lvUNamdw';

export default async function proxy(request) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // 세션 토큰 자동 갱신 — 서버 컴포넌트/API Route에서 세션 읽기에 필수
    try {
        await supabase.auth.getUser();
    } catch {
        // 세션 갱신 실패 시 조용히 무시 (로그인 여부는 각 라우트에서 처리)
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
