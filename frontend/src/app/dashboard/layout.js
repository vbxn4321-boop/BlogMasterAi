"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/lib/ThemeProvider";
import { startOnboarding } from "@/components/onboarding/OnboardingTour";
import InquiryWidget from "@/components/InquiryWidget";
import CompanyBillingGateModal from "@/components/CompanyBillingGateModal";

// 온보딩 투어가 정의되어 있는 페이지만 매핑 — 나머지 페이지(설정 등)에서는 버튼을 숨긴다.
const ONBOARDING_PAGE_KEYS = {
    '/dashboard': 'dashboard',
    '/dashboard/accounts': 'accounts',
    '/dashboard/post': 'post',
    '/dashboard/keywords': 'keywords',
    '/dashboard/analytics': 'analytics',
};

// SVG Icons
const Icons = {
    Dashboard: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
    ),
    Users: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    ),
    PlusCircle: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>
    ),
    BarChart: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
    ),
    Shield: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    ),
    FileText: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14.5 2 14.5 7.5 20 7.5" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
    ),
    LogOut: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
    ),
    Search: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
    ),
    Settings: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    )
};

const navItems = [
    { href: '/dashboard', icon: <Icons.Dashboard />, label: '대시보드' },
    // { href: '/dashboard/schedule', icon: <Icons.FileText />, label: '예약 관리' }, // 비활성화
    { href: '/dashboard/accounts', icon: <Icons.Users />, label: '네이버 계정' },
    { href: '/dashboard/post', icon: <Icons.PlusCircle />, label: '새 포스팅' },
    { href: '/dashboard/keywords', icon: <Icons.Search />, label: '황금 키워드' },
    { href: '/dashboard/analytics', icon: <Icons.BarChart />, label: '순위 분석' },
    { href: '/dashboard/settings', icon: <Icons.Settings />, label: '설정 및 구독' },
];

export default function DashboardLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const { isDark, toggleTheme } = useTheme();
    const onboardingPageKey = ONBOARDING_PAGE_KEYS[pathname];
    const [loading, setLoading] = useState(true);
    const [needsCompanyBilling, setNeedsCompanyBilling] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null); // { step, message, percent, postId }
    const [showExtensionBanner, setShowExtensionBanner] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const uploadPollRef = useRef(null);
    const supabase = createClient();

    // 페이지 이동 시 모바일 드로어 자동 닫힘
    useEffect(() => { setMobileNavOpen(false); }, [pathname]);

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.alert('로그인이 필요한 서비스입니다.');
                router.push('/login');
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin, plan_type')
                .eq('id', user.id)
                .single();

            // 관리자는 전용 화면(/admin)으로 보낸다.
            if (profile?.is_admin) {
                router.push('/admin');
                return;
            }

            // 컴퍼니로 전환됐지만 아직 카드(빌링키) 등록을 안 한 회원은 결제 전까지 대시보드 진입 차단
            if (profile?.plan_type === 'company') {
                const { data: sub } = await supabase
                    .from('subscriptions')
                    .select('status')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .maybeSingle();
                if (!sub) {
                    setNeedsCompanyBilling(true);
                    setLoading(false);
                    return;
                }
            }

            setLoading(false);
        };
        checkAccess();
    }, []);

    // 확장프로그램 연결 상태 확인 (최초 1회)
    useEffect(() => {
        if (sessionStorage.getItem('ext_banner_dismissed')) return;
        const timeout = setTimeout(() => setShowExtensionBanner(true), 2500);
        const handler = (event) => {
            if (event.data?.type !== 'BLOGMASTER_CONNECTION_STATUS') return;
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            if (!event.data.connected) setShowExtensionBanner(true);
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'BLOGMASTER_CHECK_CONNECTION' }, '*');
        return () => { clearTimeout(timeout); window.removeEventListener('message', handler); };
    }, []);

    // 익스텐션 context 무효화 실시간 감지 (10초마다 + 탭 포커스 시)
    useEffect(() => {
        let alerted = false;

        const check = () => {
            if (alerted) return;
            const handler = (event) => {
                if (event.data?.type !== 'BLOGMASTER_CONNECTION_STATUS') return;
                window.removeEventListener('message', handler);
                if (event.data.contextInvalidated && !alerted) {
                    alerted = true;
                    const ok = window.confirm(
                        '확장프로그램이 업데이트되었습니다.\n페이지를 새로고침해야 정상적으로 사용할 수 있습니다.\n\n지금 새로고침하시겠습니까?'
                    );
                    if (ok) window.location.reload();
                }
            };
            window.addEventListener('message', handler);
            window.postMessage({ type: 'BLOGMASTER_CHECK_CONNECTION' }, '*');
        };

        const interval = setInterval(check, 10000);
        const handleVisibility = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // 사이드바 업로드 진행 상태 폴링
    useEffect(() => {
        const poll = async () => {
            try {
                // 진행 중인 포스트 조회 (pending, generating, posting, pending_extension)
                const { data: activePosts } = await supabase
                    .from('posts')
                    .select('id, status, error_message')
                    .in('status', ['pending', 'generating', 'posting', 'pending_extension'])
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (activePosts && activePosts.length > 0) {
                    const post = activePosts[0];
                    // PROGRESS_V2 파싱
                    if (post.error_message?.startsWith('PROGRESS_V2|')) {
                        const parts = post.error_message.split('|');
                        setUploadProgress({
                            postId: post.id,
                            step: parts[1] || '',
                            message: parts[2] || '',
                            percent: parseInt(parts[3]) || 0,
                        });
                    } else {
                        setUploadProgress({ postId: post.id, step: post.status, message: '진행 중...', percent: 0 });
                    }
                } else {
                    setUploadProgress(null);
                }
            } catch (_) {}

            uploadPollRef.current = setTimeout(poll, 3000);
        };

        poll();
        return () => { if (uploadPollRef.current) clearTimeout(uploadPollRef.current); };
    }, []);


    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (loading) return null;

    // 결제 전 컴퍼니 회원은 대시보드 화면 전체를 대신해 이 모달만 렌더링 — 결제 완료 전까지는
    // 네비게이션/사이드바를 포함해 어떤 페이지 콘텐츠도 노출하지 않는다.
    if (needsCompanyBilling) {
        return <CompanyBillingGateModal onCompleted={() => setNeedsCompanyBilling(false)} />;
    }

    const uploadBadge = uploadProgress && (
        <span
            className="topnav-upload"
            title={`${uploadProgress.step}${uploadProgress.message && uploadProgress.message !== '진행 중...' ? ' · ' + uploadProgress.message : ''}`}
        >
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                animation: 'pulse 1.4s ease-in-out infinite', flexShrink: 0,
            }} />
            {uploadProgress.percent}%
        </span>
    );

    return (
        <div style={{ minHeight: '100vh' }}>
            {/* Top Navigation */}
            <header className="topnav">
                <div className="topnav-inner">
                    <Link href="/dashboard" className="topnav-logo">블로그 마스터 AI</Link>

                    <nav className="topnav-links">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`topnav-link ${pathname === item.href ? 'active' : ''}`}
                            >
                                <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="topnav-actions">
                        {uploadBadge}
                        {onboardingPageKey && (
                            <button onClick={() => startOnboarding(onboardingPageKey)} className="topnav-icon-btn" title="온보딩 다시보기">
                                💡
                            </button>
                        )}
                        <button onClick={toggleTheme} className="topnav-icon-btn" title={isDark ? '라이트 모드' : '다크 모드'}>
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        <button onClick={handleLogout} className="topnav-icon-btn" title="로그아웃">
                            <Icons.LogOut />
                        </button>
                    </div>

                    <button
                        type="button"
                        className="topnav-hamburger"
                        aria-label="메뉴 열기"
                        aria-expanded={mobileNavOpen}
                        onClick={() => setMobileNavOpen(v => !v)}
                    >
                        ☰
                    </button>
                </div>

                {mobileNavOpen && (
                    <div className="topnav-dropdown">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`topnav-link ${pathname === item.href ? 'active' : ''}`}
                            >
                                <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                        {uploadBadge && <div style={{ padding: '4px 14px' }}>{uploadBadge}</div>}
                        {onboardingPageKey && (
                            <button
                                onClick={() => { startOnboarding(onboardingPageKey); setMobileNavOpen(false); }}
                                className="topnav-link"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', justifyContent: 'flex-start' }}
                            >
                                <span>💡</span>
                                온보딩 다시보기
                            </button>
                        )}
                        <button
                            onClick={toggleTheme}
                            className="topnav-link"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', justifyContent: 'flex-start' }}
                        >
                            <span>{isDark ? '☀️' : '🌙'}</span>
                            {isDark ? '라이트 모드' : '다크 모드'}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="topnav-link"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', justifyContent: 'flex-start' }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center' }}><Icons.LogOut /></span>
                            로그아웃
                        </button>
                    </div>
                )}
            </header>

            {mobileNavOpen && (
                <div className="topnav-backdrop" onClick={() => setMobileNavOpen(false)} />
            )}

            {/* Main Content */}
            <main className="main-content">
                {showExtensionBanner && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)',
                        borderRadius: 10, padding: '12px 16px', margin: '16px 16px 0',
                        fontSize: 13, color: '#fbbf24',
                    }}>
                        <span style={{ fontSize: 18 }}>⚠️</span>
                        <span style={{ flex: 1 }}>
                            <strong>Blog Master 확장프로그램이 연결되지 않았습니다.</strong>
                            &nbsp; 크롬 확장프로그램을 열어 토큰을 입력하고 연결해 주세요.
                        </span>
                        <button onClick={() => {
                            setShowExtensionBanner(false);
                            sessionStorage.setItem('ext_banner_dismissed', '1');
                        }} style={{
                            background: 'none', border: 'none', color: '#fbbf24',
                            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px'
                        }}>✕</button>
                    </div>
                )}
                {children}
            </main>

            <InquiryWidget />
        </div>
    );
}
