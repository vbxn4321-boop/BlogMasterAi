'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WordCloud, competitionStyle, saturationStyle } from './RecommendationsWidget';
import { DEMO_KEYWORDS } from '@/lib/trial';
import { KeywordListRow } from '@/components/ui';

// 비구독 사용자에게 보여주는 "추천 키워드" 위젯의 체험판.
// RecommendationsWidget과 달리 실제 계정/네이버 API를 조회하지 않고 DEMO_KEYWORDS 고정 데이터를 사용한다.
// WordCloud 렌더링 로직은 RecommendationsWidget에서 그대로 재사용(중복 없음).
export default function DemoRecommendationsWidget() {
    const [viewMode, setViewMode] = useState('list');
    const router = useRouter();

    const listKeywords = [...DEMO_KEYWORDS].sort((a, b) => b.total_volume - a.total_volume).slice(0, 10);

    const handleStart = () => router.push('/dashboard/post');

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32, position: 'relative' }}>
            {/* 헤더 */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700 }}>추천 키워드</h2>
                        <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
                            background: 'var(--accent-glow)', color: 'var(--accent)',
                        }}>
                            예시 데이터 · 체험 중
                        </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        구독하면 내 계정 컨셉 기반의 실시간 추천 키워드를 확인할 수 있어요.
                    </p>
                </div>

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
                    {viewMode === 'list' ? '워드클라우드' : '리스트'}
                </button>
            </div>

            {/* 본문 */}
            <div style={{ padding: '16px 24px 20px' }}>
                {viewMode === 'cloud' ? (
                    <WordCloud keywords={DEMO_KEYWORDS} onSelect={handleStart} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {listKeywords.map((item, idx) => {
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
                                    onAction={handleStart}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
