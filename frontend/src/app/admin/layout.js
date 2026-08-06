"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/lib/ThemeProvider";

const adminNavItems = [
    { href: '/admin/members', icon: '👥', label: '회원 관리' },
    { href: '/admin/automation', icon: '⏰', label: '자동화' },
    { href: '/admin/subscriptions', icon: '💳', label: '구독 관리' },
    { href: '/admin/inquiries', icon: '💬', label: '문의' },
];

export default function AdminLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const { isDark, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();

            if (!profile?.is_admin) {
                router.push('/dashboard');
                return;
            }
            setLoading(false);
        };
        checkAccess();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (loading) return null;

    return (
        <div style={{ minHeight: '100vh' }}>
            <header className="topnav">
                <div className="topnav-inner">
                    <Link href="/admin/members" className="topnav-logo">블로그 마스터 AI · 관리자</Link>

                    <nav className="topnav-links">
                        {adminNavItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`topnav-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
                            >
                                <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="topnav-actions">
                        <button onClick={toggleTheme} className="topnav-icon-btn" title={isDark ? '라이트 모드' : '다크 모드'}>
                            <span>{isDark ? '☀️' : '🌙'}</span>
                            <span>{isDark ? '라이트' : '다크'}</span>
                        </button>
                        <button onClick={handleLogout} className="topnav-icon-btn" title="로그아웃">
                            <span>🚪</span>
                            <span>로그아웃</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
