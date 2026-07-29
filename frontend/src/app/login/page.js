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

        window.location.href = profile?.is_admin ? "/admin" : "/dashboard";
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(ellipse at top, rgba(27,67,50,0.1), transparent 60%), var(--bg-primary)',
            padding: '20px',
        }}>
            <div className="glass-card animate-in" style={{ maxWidth: 420, width: '100%' }}>
                <h1 style={{
                    fontSize: 24,
                    fontWeight: 800,
                    marginBottom: 8,
                    background: 'var(--gradient-1)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>로그인</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28 }}>
                    블로그 마스터 AI 계정으로 로그인하세요.
                </p>

                {withdrawn && (
                    <p style={{
                        color: 'var(--success)', fontSize: 13, marginBottom: 20,
                        padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8,
                    }}>
                        탈퇴 처리가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.
                    </p>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>이메일</label>
                        <input
                            type="email"
                            className="input-field"
                            placeholder="example@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>비밀번호</label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <p style={{ color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                            {error}
                        </p>
                    )}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                        {loading ? '로그인 중...' : '로그인'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                    계정이 없으신가요?{' '}
                    <Link href="/signup" style={{ color: 'var(--accent)', textDecoration: 'none' }}>회원가입</Link>
                </p>
            </div>
        </div>
    );
}
