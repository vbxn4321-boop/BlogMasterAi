'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InfoTooltip, StatusPill, KeywordListRow } from '@/components/ui';

export const competitionStyle = {
    '낮음': { color: '#22c55e', label: '경쟁 낮음' },
    '중간': { color: '#f59e0b', label: '경쟁 중간' },
    '높음': { color: '#ef4444', label: '경쟁 높음' },
};

// 포화도(발행글수÷검색량, blog_total_cache 기반) — 5단계 원본을 3단계로 축약해서 표시 (v6 스펙 §6-3)
export const saturationStyle = {
    '낮음': { color: '#22c55e', label: '포화도 낮음' },
    '중간': { color: '#f59e0b', label: '포화도 중간' },
    '높음': { color: '#ef4444', label: '포화도 높음' },
    '측정중': { color: '#94a3b8', label: '측정중' },
};

function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function WordCloud({ keywords, onSelect }) {
    if (!keywords || keywords.length === 0) return null;

    const volumes = keywords.map(k => k.total_volume);
    const maxVol = Math.max(...volumes);
    const minVol = Math.min(...volumes);

    const getFontSize = (volume) => {
        if (maxVol === minVol) return 20;
        const ratio = (volume - minVol) / (maxVol - minVol);
        return Math.round(13 + ratio * 34);
    };

    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            alignItems: 'center', padding: '24px 16px', minHeight: 220, gap: '2px',
        }}>
            {keywords.map((item, idx) => {
                const fontSize = getFontSize(item.total_volume);
                const comp = competitionStyle[item.competition] || competitionStyle['높음'];
                const sat = saturationStyle[item.saturation] || saturationStyle['측정중'];
                const h = hashStr(item.keyword);
                const mt = (h % 18) - 9;
                const ml = (h % 12) - 6;

                return (
                    <span
                        key={idx}
                        onClick={() => onSelect(item.keyword)}
                        title={`월 ${item.total_volume.toLocaleString()}회 · ${comp.label} · ${sat.label}`}
                        style={{
                            fontSize,
                            fontWeight: fontSize > 28 ? 800 : fontSize > 20 ? 700 : 500,
                            color: comp.color,
                            cursor: 'pointer',
                            padding: '2px 5px',
                            marginTop: mt,
                            marginLeft: ml,
                            lineHeight: 1.35,
                            opacity: 0.82,
                            userSelect: 'none',
                            transition: 'opacity 0.15s, transform 0.15s',
                            display: 'inline-block',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.transform = 'scale(1.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = 0.82; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        {item.keyword}
                    </span>
                );
            })}
        </div>
    );
}

function UsedKeywordsSection({ usedKeywords }) {
    const [open, setOpen] = useState(false);

    if (!usedKeywords || usedKeywords.length === 0) return null;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };

    return (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            {/* 접기/펼치기 헤더 */}
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 24px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                        사용한 추천 키워드
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '1px 8px', borderRadius: 99,
                        background: 'var(--accent-glow)', color: 'var(--accent)',
                    }}>
                        {usedKeywords.length}개
                    </span>
                </div>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* 키워드 목록 */}
            {open && (
                <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {usedKeywords.map((item, idx) => {
                        const comp = competitionStyle[item.competition] || competitionStyle['높음'];
                        const sat = saturationStyle[item.saturation] || saturationStyle['측정중'];
                        return (
                            <div key={idx} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '9px 14px', borderRadius: 10,
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                gap: 12, opacity: 0.8,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.keyword}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        월 {item.total_volume.toLocaleString()}
                                    </span>
                                    <StatusPill color={comp.color}>{comp.label}</StatusPill>
                                    <StatusPill color={sat.color}>{sat.label}</StatusPill>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {formatDate(item.completed_at)}
                                    </span>
                                    {item.url && (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                fontSize: 11, fontWeight: 600,
                                                color: 'var(--accent)', textDecoration: 'none',
                                            }}
                                        >
                                            보기 →
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// 컨셉 키워드 풀이 아직 없어 서버가 온디맨드로 생성 중일 때 재조회할 간격
const GENERATING_POLL_MS = 5000;

function AccountKeywords({ account, viewMode }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [generating, setGenerating] = useState(false);
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;
        let pollTimer = null;

        const load = (isPoll) => {
            if (!isPoll) {
                setLoading(true);
                setError(null);
                setData(null);
                setGenerating(false);
            }
            fetch(`/api/recommendations?account_id=${account.id}`)
                .then(r => r.json())
                .then(d => {
                    if (cancelled) return;
                    if (d.error) {
                        setError(d.error);
                        setGenerating(false);
                        return;
                    }
                    if (d.status === 'generating') {
                        // 이 컨셉은 처음 선택되어 추천 키워드를 새로 준비하는 중 — 잠시 후 다시 조회
                        setGenerating(true);
                        setData(d);
                        pollTimer = setTimeout(() => load(true), GENERATING_POLL_MS);
                        return;
                    }
                    setGenerating(false);
                    setData(d);
                })
                .catch(() => { if (!cancelled) setError('불러오기 실패'); })
                .finally(() => { if (!cancelled) setLoading(false); });
        };

        load(false);

        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [account.id]);

    const handleStart = (keyword) => {
        router.push(`/dashboard/post?topic=${encodeURIComponent(keyword)}`);
    };

    if (loading) {
        return (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                키워드 분석 중...
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--error)', fontSize: 13 }}>
                {error}
            </div>
        );
    }
    if (generating) {
        return (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)',
                    animation: 'spin 0.8s linear infinite',
                }} />
                <div>
                    이 컨셉의 추천 키워드를 처음 준비하고 있어요.<br />
                    최대 1~2분 정도 걸릴 수 있어요. 잠시만 기다려주세요.
                </div>
                <style jsx>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }
    if (!data) return null;

    // 워드클라우드 뷰
    if (viewMode === 'cloud') {
        const cloudKeywords = data.all_keywords || data.keywords || [];
        return (
            <>
                {cloudKeywords.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        표시할 키워드가 없습니다.
                    </div>
                ) : (
                    <WordCloud keywords={cloudKeywords} onSelect={handleStart} />
                )}
                <UsedKeywordsSection usedKeywords={data.used_keywords} />
            </>
        );
    }

    // 리스트 뷰
    return (
        <>
            {data.keywords.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    추천 키워드가 없습니다. 잠시 후 다시 시도해주세요.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.keywords.map((item, idx) => {
                        const comp = competitionStyle[item.competition] || competitionStyle['높음'];
                        const sat = saturationStyle[item.saturation] || saturationStyle['측정중'];
                        return (
                            <KeywordListRow
                                key={idx}
                                rank={idx + 1}
                                keyword={item.keyword}
                                volume={item.total_volume}
                                competition={comp}
                                saturation={sat}
                                onAction={() => handleStart(item.keyword)}
                            />
                        );
                    })}
                </div>
            )}
            <UsedKeywordsSection usedKeywords={data.used_keywords} />
        </>
    );
}

export default function RecommendationsWidget({ account }) {
    const [viewMode, setViewMode] = useState('list');

    if (!account) return null;

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
            {/* 헤더 */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>추천 키워드</h2>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                        <span>
                            {viewMode === 'list'
                                ? '계정 컨셉 기반 · 아직 발행하지 않은 키워드'
                                : '네이버 연관 키워드 전체 · 크기 = 월 검색량'}
                        </span>
                        <InfoTooltip
                            label="경쟁도"
                            description="네이버 검색광고의 광고 입찰 경쟁 정도(compIdx)입니다. 광고주들이 이 키워드에 얼마나 몰리는지를 나타냅니다."
                        />
                        <InfoTooltip
                            label="포화도"
                            description="검색량 대비 이미 발행된 블로그 글이 얼마나 많은지 나타내는 지표입니다."
                            formulaLines={[
                                '포화도(%) = 발행글 수 ÷ 월간 검색량 × 100',
                                '5%↓ 매우낮음 · 10%↓ 낮음 · 30%↓ 보통 · 50%↓ 높음 · 50%↑ 매우높음',
                                '(화면엔 낮음/중간/높음 3단계로 축약 표시)',
                            ]}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={() => setViewMode(v => v === 'list' ? 'cloud' : 'list')}
                        title={viewMode === 'list' ? '워드클라우드로 전환' : '리스트로 전환'}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 12, fontWeight: 700,
                            padding: '6px 14px', borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: viewMode === 'cloud' ? 'var(--accent)' : 'var(--bg-secondary)',
                            color: viewMode === 'cloud' ? '#fff' : 'var(--text-secondary)',
                            cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                        }}
                    >
                        {viewMode === 'list' ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" /><circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
                                </svg>
                                워드클라우드
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                                </svg>
                                리스트
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* 키워드 본문 */}
            <div style={{ padding: '16px 24px 20px' }}>
                <AccountKeywords key={account.id} account={account} viewMode={viewMode} />
            </div>

            {/* 워드클라우드 범례 */}
            {viewMode === 'cloud' && (
                <div style={{
                    padding: '10px 24px 14px',
                    display: 'flex', alignItems: 'center', gap: 20,
                    borderTop: '1px solid var(--border)',
                }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>경쟁도</span>
                    {Object.entries(competitionStyle).map(([key, val]) => (
                        <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: val.color, display: 'inline-block' }} />
                            <span style={{ color: 'var(--text-muted)' }}>{val.label}</span>
                        </span>
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>· 클릭 시 포스팅 시작</span>
                </div>
            )}
        </div>
    );
}
