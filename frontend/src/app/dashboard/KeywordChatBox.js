'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 직전에 AI가 확정 제안(proposal)을 했을 때, 사용자가 버튼 대신 텍스트로 긍정 답변한
// 경우에도 API를 다시 호출하지 않고 바로 이동시키기 위한 간단한 긍정어 판별.
const AFFIRMATIVE = /^(예|네|응|어|그래|좋아|콜|go|yes|시작|발행)/i;

// 실제로는 Gemini 호출 1번 + 네이버 API 조회로 이루어지는 단일 요청이지만, 그동안 아무
// 진행 상황도 안 보이면 지루하니 그럴듯한 단계들을 순서대로 보여준다(진짜 서버 진행률은 아님).
const LOADING_STEPS = [
    '메시지를 분석하는 중...',
    '네이버 API로 키워드를 찾는 중...',
    '키워드 검색량을 분석하는 중...',
    '연관 키워드를 찾는 중...',
    '제안을 정리하는 중...',
];
const LOADING_STEP_MS = 1200;

// 화면 뒤에 깔리는 은은한 블러 그라데이션 블롭 — 브랜드 컬러(틸/블루) 안에서만 움직여
// 화려하되 색상 일관성은 깨지 않는다.
function BackgroundBlobs() {
    return (
        <>
            <div style={{
                position: 'absolute', top: -90, left: '8%', width: 260, height: 260,
                borderRadius: '50%', background: '#00b894', opacity: 0.32, filter: 'blur(70px)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', top: -60, right: '10%', width: 240, height: 240,
                borderRadius: '50%', background: '#0090ff', opacity: 0.28, filter: 'blur(70px)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: -100, left: '38%', width: 260, height: 260,
                borderRadius: '50%', background: '#5eead4', opacity: 0.22, filter: 'blur(80px)', pointerEvents: 'none',
            }} />
        </>
    );
}

function ProposalCard({ proposal, onConfirm }) {
    return (
        <div style={{
            marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow-sm)',
        }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                    🎯 핵심 키워드: <span style={{ color: '#00b894' }}>{proposal.main_keyword}</span>
                    {proposal.volume != null && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: proposal.volume > 0 ? '#059669' : '#dc2626', marginLeft: 6 }}>
                            (월 {proposal.volume.toLocaleString()}회 검색)
                        </span>
                    )}
                </div>
                {proposal.sub_keywords?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>🔖 서브 키워드 및 월 검색량:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {proposal.sub_keywords.map((sub, i) => {
                                const isObj = typeof sub === 'object' && sub !== null;
                                const kw = isObj ? sub.keyword : sub;
                                const vol = isObj && sub.volume != null ? sub.volume : null;
                                return (
                                    <span key={i} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: 12, padding: '4px 10px', borderRadius: 8,
                                        background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border, #e2e8f0)',
                                        color: 'var(--text-primary)'
                                    }}>
                                        <strong>{kw}</strong>
                                        {vol != null && (
                                            <span style={{ fontSize: 11, fontWeight: 600, color: vol > 0 ? '#059669' : '#94a3b8' }}>
                                                (월 {vol.toLocaleString()}회)
                                            </span>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            <button onClick={() => onConfirm(proposal)} className="btn-primary" style={{ padding: '8px 16px', fontSize: 12.5, marginTop: 4 }}>
                이 키워드로 포스팅 시작 →
            </button>
        </div>
    );
}

export default function KeywordChatBox() {
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [error, setError] = useState('');
    const listRef = useRef(null);

    const started = messages.length > 0;

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, loading]);

    // 로딩 중에는 그럴듯한 단계 문구를 순서대로 보여줘 기다리는 동안 지루하지 않게 한다.
    useEffect(() => {
        if (!loading) { setLoadingStep(0); return; }
        const timer = setInterval(() => {
            setLoadingStep(i => Math.min(i + 1, LOADING_STEPS.length - 1));
        }, LOADING_STEP_MS);
        return () => clearInterval(timer);
    }, [loading]);

    const lastProposal = [...messages].reverse().find(m => m.proposal)?.proposal || null;

    const goToPost = (proposal) => {
        const subKwList = (proposal.sub_keywords || []).map(s => (typeof s === 'object' && s !== null) ? s.keyword : s);
        const params = new URLSearchParams({
            topic: proposal.topic || proposal.main_keyword,
            main_keyword: proposal.main_keyword,
            sub_keywords: subKwList.join(', '),
        });
        router.push(`/dashboard/post?${params.toString()}`);
    };

    const send = async (text) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        // 직전 제안이 있고 사용자가 긍정으로 답하면, API 호출 없이 바로 새 포스팅으로 이동
        if (lastProposal && AFFIRMATIVE.test(trimmed)) {
            setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
            goToPost(lastProposal);
            return;
        }

        const nextMessages = [...messages, { role: 'user', text: trimmed }];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/dashboard/keyword-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: nextMessages.map(m => ({ role: m.role, text: m.text })),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');

            const assistantMsg = { role: 'assistant', text: data.reply };
            if (data.ready && data.main_keyword) {
                assistantMsg.proposal = {
                    main_keyword: data.main_keyword,
                    sub_keywords: data.sub_keywords || [],
                    topic: data.topic,
                    volume: data.volume,
                };
            }
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const inputBar = (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 999, padding: '6px 8px 6px 20px', boxShadow: 'var(--shadow-md)',
        }}>
            <input
                style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 14.5, color: 'var(--text-primary)', padding: '10px 0',
                }}
                placeholder="예: 부산 맛집 관련 글 쓰고 싶어요"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                disabled={loading}
            />
            <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="btn-primary"
                style={{
                    width: 40, height: 40, borderRadius: '50%', padding: 0, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}
                aria-label="전송"
            >
                {loading ? '·' : '↑'}
            </button>
        </div>
    );

    return (
        <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            marginBottom: 24, transition: 'padding 0.3s ease',
        }}>
            <BackgroundBlobs />

            {!started ? (
                /* 랜딩 상태 — 큰 헤드라인 + 중앙 정렬된 입력창 (LLM 챗 홈 화면 느낌) */
                <div style={{ position: 'relative', padding: '64px 24px 56px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 10, color: 'var(--text-primary)' }}>
                        어떤 주제로 포스팅할까요?
                    </h1>
                    <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginBottom: 32 }}>
                        AI와 대화하며 실제 검색량 있는 키워드를 함께 찾아보세요
                    </p>
                    <div style={{ maxWidth: 560, margin: '0 auto' }}>
                        {inputBar}
                    </div>
                    {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--error)' }}>{error}</div>}
                </div>
            ) : (
                /* 대화 상태 — 상단에 얇은 라벨, 메시지 스레드, 하단 고정 입력창 */
                <div style={{ position: 'relative' }}>
                    <div style={{ padding: '18px 24px 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        무엇에 대해 써볼까요?
                    </div>

                    <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', padding: '8px 24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {messages.map((m, i) => (
                            m.role === 'user' ? (
                                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <div style={{
                                        maxWidth: '78%', background: 'var(--gradient-1)', color: '#fff',
                                        borderRadius: 16, padding: '10px 16px', fontSize: 14, lineHeight: 1.5,
                                    }}>
                                        {m.text}
                                    </div>
                                </div>
                            ) : (
                                <div key={i} style={{ maxWidth: '86%' }}>
                                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>{m.text}</div>
                                    {m.proposal && <ProposalCard proposal={m.proposal} onConfirm={goToPost} />}
                                </div>
                            )
                        ))}
                        {loading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                <span style={{
                                    width: 13, height: 13, borderRadius: '50%',
                                    border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                                    flexShrink: 0,
                                }} className="animate-spin" />
                                {LOADING_STEPS[loadingStep]}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div style={{ padding: '0 24px 8px', fontSize: 12, color: 'var(--error)' }}>{error}</div>
                    )}

                    <div style={{ padding: '4px 20px 20px' }}>
                        {inputBar}
                    </div>
                </div>
            )}
        </div>
    );
}
