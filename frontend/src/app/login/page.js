"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const withdrawn = searchParams.get("withdrawn") === "1";

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

        if (authError) {
            setError('이메일 혹은 비밀번호를 확인해주세요.');
            setLoading(false);
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', data.user.id)
            .single();

        const targetRedirect = searchParams.get("redirect");
        const defaultDestination = profile?.is_admin ? "/admin" : "/dashboard";
        window.location.href = targetRedirect || defaultDestination;
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
            {/* ── 좌측: 퍼플 그라데이션 소개 영역 ── */}
            <div style={{
                flex: '1 1 50%',
                background: 'linear-gradient(145deg, #00b894 0%, #0090ff 50%, #c084fc 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '60px 48px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* 배경 데코레이션 원 */}
                <div style={{
                    position: 'absolute', top: '-80px', right: '-80px',
                    width: 300, height: 300, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-60px', left: '-60px',
                    width: 240, height: 240, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                }} />
                <div style={{
                    position: 'absolute', top: '40%', right: '15%',
                    width: 120, height: 120, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 420 }}>
                    {/* 아이콘 */}
                    <div style={{
                        width: 72, height: 72, borderRadius: 18,
                        background: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 28px',
                        color: '#ffffff'
                    }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </div>

                    <h1 style={{
                        fontSize: 32, fontWeight: 800, color: '#fff',
                        lineHeight: 1.3, marginBottom: 16,
                        letterSpacing: '-0.5px',
                    }}>
                        블로그 마스터 AI
                    </h1>
                    <p style={{
                        fontSize: 16, color: 'rgba(255,255,255,0.85)',
                        lineHeight: 1.7, marginBottom: 36,
                    }}>
                        AI가 만드는 고품질 블로그 콘텐츠,<br />
                        키워드 분석부터 자동 발행까지 한 번에.
                    </p>

                    {/* 기능 하이라이트 카드들 */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: 12,
                        width: '100%',
                    }}>
                        {[
                            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>, text: 'AI 원고 자동 생성' },
                            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, text: '키워드 분석 & 순위 추적' },
                            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.5-2.5l5.5-5.5a2.121 2.121 0 0 0-3-3l-5.5 5.5c-1 .24-1.79.79-2.5 1.5z"/><path d="M15 5l3 3"/></svg>, text: '네이버 블로그 원클릭 발행' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 14,
                                padding: '14px 18px',
                                borderRadius: 12,
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(8px)',
                                color: '#ffffff'
                            }}>
                                {item.icon}
                                <span style={{
                                    fontSize: 14, fontWeight: 600, color: '#fff',
                                    letterSpacing: '-0.2px',
                                }}>
                                    {item.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 우측: 로그인 폼 영역 ── */}
            <div style={{
                flex: '1 1 50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 32px',
                background: '#ffffff',
            }}>
                <div style={{ maxWidth: 400, width: '100%' }}>
                    <h2 style={{
                        fontSize: 26, fontWeight: 800,
                        color: '#1a1a2e', marginBottom: 8,
                        letterSpacing: '-0.5px',
                    }}>
                        로그인
                    </h2>
                    <p style={{
                        color: '#8a8aaa', fontSize: 14, marginBottom: 32,
                    }}>
                        블로그 마스터 AI 계정으로 로그인하세요.
                    </p>

                    {withdrawn && (
                        <p style={{
                            color: '#10b981', fontSize: 13, marginBottom: 20,
                            padding: '12px 16px', background: 'rgba(16,185,129,0.08)',
                            borderRadius: 10, border: '1px solid rgba(16,185,129,0.15)',
                        }}>
                            탈퇴 처리가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.
                        </p>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <label style={{
                                fontSize: 13, color: '#4a4a6a', fontWeight: 600,
                                marginBottom: 8, display: 'block',
                            }}>
                                이메일
                            </label>
                            <input
                                type="email"
                                placeholder="example@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{
                                    width: '100%', padding: '13px 16px',
                                    borderRadius: 10, border: '1px solid rgba(0,184,148,0.15)',
                                    fontSize: 14, outline: 'none', background: '#fafbfc',
                                    transition: 'border-color 0.2s, box-shadow 0.2s',
                                    color: '#1a1a2e',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#00b894';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(0,184,148,0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(0,184,148,0.15)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>
                        <div>
                            <label style={{
                                fontSize: 13, color: '#4a4a6a', fontWeight: 600,
                                marginBottom: 8, display: 'block',
                            }}>
                                비밀번호
                            </label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{
                                    width: '100%', padding: '13px 16px',
                                    borderRadius: 10, border: '1px solid rgba(0,184,148,0.15)',
                                    fontSize: 14, outline: 'none', background: '#fafbfc',
                                    transition: 'border-color 0.2s, box-shadow 0.2s',
                                    color: '#1a1a2e',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#00b894';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(0,184,148,0.1)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(0,184,148,0.15)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>

                        {error && (
                            <p style={{
                                color: '#ef4444', fontSize: 13,
                                padding: '10px 14px', background: 'rgba(239,68,68,0.06)',
                                borderRadius: 10, border: '1px solid rgba(239,68,68,0.12)',
                            }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%', padding: '14px',
                                borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #00b894, #0090ff)',
                                color: '#fff', fontSize: 15, fontWeight: 700,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.6 : 1,
                                transition: 'transform 0.2s, box-shadow 0.2s, opacity 0.2s',
                                marginTop: 4,
                            }}
                            onMouseEnter={(e) => { if (!loading) { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 8px 30px rgba(0,184,148,0.35)'; }}}
                            onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = 'none'; }}
                        >
                            {loading ? '로그인 중...' : '로그인'}
                        </button>
                    </form>

                    <p style={{
                        textAlign: 'center', marginTop: 24,
                        fontSize: 13, color: '#8a8aaa',
                    }}>
                        계정이 없으신가요?{' '}
                        <Link href="/signup" style={{
                            color: '#00b894', textDecoration: 'none',
                            fontWeight: 600,
                        }}>
                            회원가입
                        </Link>
                    </p>
                </div>
            </div>

            {/* 모바일 반응형 스타일 */}
            <style jsx>{`
                @media (max-width: 768px) {
                    div:first-child > div:first-child {
                        display: none !important;
                    }
                    div:first-child {
                        flex-direction: column !important;
                    }
                }
            `}</style>
        </div>
    );
}
