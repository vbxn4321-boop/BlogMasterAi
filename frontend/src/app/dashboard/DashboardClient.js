'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ResponsiveTable } from '@/components/ui';
import { displayNaverId } from '@/lib/naver';
import RecommendationsWidget from './RecommendationsWidget';
import DemoRecommendationsWidget from './DemoRecommendationsWidget';
import KeywordChatBox from './KeywordChatBox';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import { dashboardTourSteps } from '@/lib/onboardingSteps';

function RankBadge({ rank }) {
    const color = rank <= 10 ? 'var(--success)' : rank <= 30 ? 'var(--warning)' : 'var(--error)';
    return (
        <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{rank}위</span>
    );
}

export default function DashboardClient({ accounts, rankingsByAccount, keywordsByAccount, postsByAccount, rankTrendByAccount, monthlyStatsByAccount, isSubscribed }) {
    const [selectedId, setSelectedId] = useState(accounts[0]?.id || null);
    const [isOpen, setIsOpen] = useState(false);

    const selectedAccount = accounts.find(a => a.id === selectedId) || null;
    const rankings = (selectedId && rankingsByAccount[selectedId]) || [];
    const keywords = (selectedId && keywordsByAccount[selectedId]) || [];
    const posts = (selectedId && postsByAccount[selectedId]) || [];
    const rankTrend = (selectedId && rankTrendByAccount?.[selectedId]) || null;
    const monthlyStats = (selectedId && monthlyStatsByAccount?.[selectedId]) || null;

    return (
        <>
            {/* 계정 선택 + 핵심 지표를 한 줄 요약바로 압축하고, 추천 키워드를 전체 폭 메인 콘텐츠로 배치 */}
            <div
                className="glass-card"
                data-tour="dash-account-selector"
                style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 28px',
                    padding: '16px 24px', marginBottom: 24, position: 'relative', zIndex: isOpen ? 10 : 'auto',
                }}
            >
                {/* 연결된 계정 — 선택형 드롭다운 */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    {accounts.length === 0 ? (
                        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>등록된 계정 없음</span>
                    ) : (
                        <>
                            {isOpen && (
                                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setIsOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => setIsOpen(o => !o)}
                                style={{
                                    position: 'relative', zIndex: 100, display: 'flex',
                                    alignItems: 'center', gap: 8,
                                    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                                    color: 'var(--text-primary)', textAlign: 'left',
                                }}
                            >
                                <span className="stat-value" style={{ fontSize: 20, whiteSpace: 'nowrap' }}>
                                    {selectedAccount ? displayNaverId(selectedAccount.naver_id) : '계정 선택'}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                                    {isOpen ? '▲' : '▼'}
                                </span>
                            </button>
                            {isOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: 220,
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 10, overflowY: 'auto', maxHeight: 240, zIndex: 101,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                }}>
                                    {accounts.map(acc => (
                                        <div
                                            key={acc.id}
                                            onClick={() => { setSelectedId(acc.id); setIsOpen(false); }}
                                            style={{
                                                padding: '10px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                                                fontWeight: acc.id === selectedId ? 700 : 500,
                                                color: acc.id === selectedId ? 'var(--accent)' : 'var(--text-primary)',
                                                background: acc.id === selectedId ? 'rgba(0,184,148,0.12)' : 'transparent',
                                            }}
                                        >
                                            <div>{displayNaverId(acc.naver_id)}</div>
                                            {acc.concept && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{acc.concept}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {accounts.length > 0 && (
                    <>
                        <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

                        {/* 최근 발행 키워드 */}
                        <div data-tour="dash-keywords-card" style={{ minWidth: 0 }}>
                            <div className="stat-label" style={{ marginBottom: 2 }}>최근 발행 키워드</div>
                            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                {keywords[0]?.keyword || '-'}
                            </div>
                        </div>

                        <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

                        {/* 상위 노출 포스트 */}
                        <div data-tour="dash-ranking-card">
                            <div className="stat-label" style={{ marginBottom: 2 }}>상위 노출 포스트</div>
                            {rankTrend ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <RankBadge rank={rankTrend.currentRank} />
                                    {rankTrend.delta != null && rankTrend.delta !== 0 && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 700,
                                            color: rankTrend.delta > 0 ? 'var(--success)' : 'var(--error)',
                                        }}>
                                            {rankTrend.delta > 0 ? '▲' : '▼'} {Math.abs(rankTrend.delta)}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>-</div>
                            )}
                        </div>

                        <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

                        {/* 이번 달 발행 통계 */}
                        <div data-tour="dash-monthly-stats">
                            <div className="stat-label" style={{ marginBottom: 2 }}>이번 달 발행</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                                {monthlyStats && monthlyStats.total > 0 ? `${monthlyStats.total}건 · 성공률 ${monthlyStats.successRate}%` : '-'}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 대화형 키워드 추천 — 자유 주제 입력 → AI가 핵심/서브 키워드·요약 제안 → 확정 시 새 포스팅으로 이동 */}
            <KeywordChatBox />

            {/* Recommendations Widget — 전체 폭 메인 콘텐츠 */}
            <div data-tour="dash-recommendations" style={{ marginBottom: 40 }}>
                {isSubscribed ? (
                    <RecommendationsWidget account={selectedAccount} />
                ) : (
                    <DemoRecommendationsWidget />
                )}
            </div>

            {/* Recent Posts Table — 선택된 계정 기준, 실패 글 제외, 상태 컬럼 없음 */}
            <div data-tour="dash-recent-posts" className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>최근 포스팅</h2>
                </div>
                {posts.length > 0 ? (
                    <ResponsiveTable>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>주제</th>
                                    <th>날짜</th>
                                    <th>링크</th>
                                </tr>
                            </thead>
                            <tbody>
                                {posts.map((post) => (
                                    <tr key={post.postId} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontWeight: 500 }}>
                                            <Link href={`/dashboard/post?id=${post.postId}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                                                {post.title}
                                            </Link>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                            <div>{new Date(post.createdAt).toLocaleDateString('ko-KR')}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{new Date(post.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td>
                                            {post.isPendingSchedule ? (
                                                <Link href={`/dashboard/post?id=${post.postId}`} style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }} title={`예약 시각: ${new Date(post.scheduledAt).toLocaleString('ko-KR')}`}>
                                                    예약됨 · {new Date(post.scheduledAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </Link>
                                            ) : post.url ? (
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                        style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                                        블로그 보기 →
                                                    </a>
                                                    <Link href={`/dashboard/post?id=${post.postId}`} style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>
                                                        (상세)
                                                    </Link>
                                                </div>
                                            ) : (
                                                <Link href={`/dashboard/post?id=${post.postId}`}
                                                    style={{
                                                        color: 'var(--warning)', background: 'rgba(234, 179, 8, 0.12)',
                                                        border: '1px solid rgba(234, 179, 8, 0.3)', padding: '4px 10px',
                                                        borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                                                        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer'
                                                    }}>
                                                    처리 대기 중 🔍
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ResponsiveTable>
                ) : (
                    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {accounts.length === 0 ? '먼저 네이버 계정을 등록해 주세요.' : '아직 포스팅이 없습니다. 첫 포스팅을 시작해 보세요!'}
                    </div>
                )}
            </div>

            <OnboardingTour pageKey="dashboard" steps={dashboardTourSteps} />
        </>
    );
}
