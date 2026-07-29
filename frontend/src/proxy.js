import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export default async function proxy(request) {
    let supabaseResponse = NextResponse.next({ request });

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            request.cookies.set(name, value, options)
                        );
                        supabaseResponse = NextResponse.next({ request });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options)
                        );
                    },
                },
            }
        );

        // This refresh the session if it's expired
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            console.error('[Middleware] Auth check error:', error.message);
        }

        const path = request.nextUrl.pathname;

        // Redirect unauthenticated users to login
        if (!user && !path.startsWith('/login') && !path.startsWith('/signup') && path !== '/') {
            console.log(`[Middleware] Redirecting guest from ${path} to /login`);
            const url = request.nextUrl.clone();
            url.pathname = '/login';
            return NextResponse.redirect(url);
        }

        // Redirect authenticated users away from login
        if (user && (path === '/login' || path === '/signup')) {
            console.log(`[Middleware] Redirecting user from ${path} to /dashboard`);
            const url = request.nextUrl.clone();
            url.pathname = '/dashboard';
            return NextResponse.redirect(url);
        }

        return supabaseResponse;
    } catch (err) {
        console.error('[Middleware] Critical Error:', err.message);
        return supabaseResponse;
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
