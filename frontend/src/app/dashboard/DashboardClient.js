'use client';

import { useState, useEffect } from 'react';
import { StatCard, ResponsiveTable } from '@/components/ui';
import { displayNaverId } from '@/lib/naver';
import RecommendationsWidget from './RecommendationsWidget';
import DemoRecommendationsWidget from './DemoRecommendationsWidget';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import { dashboardTourSteps } from '@/lib/onboardingSteps';

const ROTATE_INTERVAL_MS = 5500;

function RankBadge({ rank }) {
    const color = rank <= 10 ? 'var(--success)' : rank <= 30 ? 'var(--warning)' : 'var(--error)';
    return (
        <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{rank}위</span>
    );
}

function formatDate(iso) {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 항목이 1개 보이다가 2~3초마다 자동으로 다음 항목으로 바뀌고, 클릭하면 전체(최대 5개)를
// 목록으로 펼쳐 보여주는 카드. "최근 발행 키워드"와 "상위 노출 포스트" 두 곳에서 공용으로 쓴다.
function RotatingStatCard({ label, items, resetKey, emptyMessage, renderItem, renderListItem }) {
    const [index, setIndex] = useState(0);
    const [expanded, setExpanded] = useState(false);

    // 선택된 계정이 바뀌면 순환/펼침 상태를 처음으로 되돌린다
    useEffect(() => {
        setIndex(0);
        setExpanded(false);
    }, [resetKey]);

    useEffect(() => {
        if (expanded || items.length <= 1) return;
        const timer = setInterval(() => {
            setIndex(i => (i + 1) % items.length);
        }, ROTATE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [expanded, items.length]);

    if (items.length === 0) {
        return (
            <StatCard label={label}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{emptyMessage}</div>
            </StatCard>
        );
    }

    return (
        <StatCard label={label}>
            <div onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', marginTop: 4 }}>
                {expanded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {items.map((item, i) => <div key={i}>{renderListItem(item)}</div>)}
                    </div>
                ) : (
                    renderItem(items[index])
                )}
            </div>
        </StatCard>
    );
}

export default function DashboardClient({ accounts, rankingsByAccount, keywordsByAccount, postsByAccount, isSubscribed }) {
    const [selectedId, setSelectedId] = useState(accounts[0]?.id || null);
    const [isOpen, setIsOpen] = useState(false);

    const selectedAccount = accounts.find(a => a.id === selectedId) || null;
    const rankings = (selectedId && rankingsByAccount[selectedId]) || [];
    const keywords = (selectedId && keywordsByAccount[selectedId]) || [];
    const posts = (selectedId && postsByAccount[selectedId]) || [];

    return (
        <>
            {/* Stat Cards */}
            <div className="bm-grid bm-grid-3" style={{ marginBottom: 40 }}>
                {/* 연결된 계정 — 선택형 드롭다운 */}
                {/* glass-card는 backdrop-filter 때문에 각자 독립된 stacking context를 만들어서,
                    내부 드롭다운에 z-index를 아무리 줘도 뒤에 오는 다른 glass-card(추천 키워드 등)를
                    못 넘어선다. 카드 자체를 열려있을 때만 positioned + z-index로 끌어올려야 한다. */}
                <div data-tour="dash-account-selector">
                <StatCard label="연결된 계정" style={{ position: 'relative', zIndex: isOpen ? 10 : 'auto' }}>
                    {accounts.length === 0 ? (
                        <span className="stat-value" style={{ fontSize: 15 }}>등록된 계정 없음</span>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            {isOpen && (
                                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setIsOpen(false)} />
                            )}
                            <button
                                type="button"
                                onClick={() => setIsOpen(o => !o)}
                                style={{
                                    position: 'relative', zIndex: 100, width: '100%', display: 'flex',
                                    alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                                    color: 'var(--text-primary)', textAlign: 'left',
                                }}
                            >
                                <span className="stat-value" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedAccount ? displayNaverId(selectedAccount.naver_id) : '계정 선택'}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                                    {isOpen ? '▲' : '▼'}
                                </span>
                            </button>
                            {isOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: 10, overflowY: 'auto', maxHeight: 240, zIndex: 101,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                }}>
                                    {accounts.map(acc => (
                                        <div
                                            key={acc.id}
                                            onClick={() => { setSelectedId(acc.id); setIsOpen(false); }}
                                            style={{
                                                padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                                                fontWeight: acc.id === selectedId ? 700 : 500,
                                                color: acc.id === selectedId ? 'var(--accent)' : 'var(--text-primary)',
                                                background: acc.id === selectedId ? 'rgba(27,67,50,0.12)' : 'transparent',
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
                        </div>
                    )}
                </StatCard>
                </div>

                {/* 최근 발행 키워드 — 선택 계정 기준 (1개씩 자동 순환, 클릭 시 최대 5개 목록) */}
                <div data-tour="dash-keywords-card">
                <RotatingStatCard
                    label="최근 발행 키워드"
                    items={keywords}
                    resetKey={selectedId}
                    emptyMessage={accounts.length === 0 ? '-' : '아직 발행된 키워드가 없습니다.'}
                    renderItem={(item) => (
                        <div>
                            <div className="stat-value" style={{ fontSize: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.keyword}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{formatDate(item.createdAt)}</div>
                        </div>
                    )}
                    renderListItem={(item) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.keyword}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDate(item.createdAt)}</span>
                        </div>
                    )}
                />
                </div>

                {/* 상위 노출 포스트 — 선택 계정 기준 (1개씩 자동 순환, 클릭 시 최대 5개 목록) */}
                <div data-tour="dash-ranking-card">
                <RotatingStatCard
                    label="상위 노출 포스트"
                    items={rankings.slice(0, 5)}
                    resetKey={selectedId}
                    emptyMessage={
                        accounts.length === 0
                            ? '-'
                            : <>아직 확인된 순위가 없습니다.<br /><a href="/dashboard/analytics" style={{ color: 'var(--accent)', fontWeight: 600 }}>순위분석에서 확인하기 →</a></>
                    }
                    renderItem={(item) => (
                        <div>
                            <div className="stat-value" style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.title}
                            </div>
                            <div style={{ marginTop: 4 }}><RankBadge rank={item.rank} /></div>
                        </div>
                    )}
                    renderListItem={(item) => (
                        <div
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                                color: 'var(--text-primary)', fontSize: 12.5,
                            }}
                        >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            <RankBadge rank={item.rank} />
                        </div>
                    )}
                />
                </div>
            </div>

            {/* Recommendations Widget — 선택된 계정 기준 */}
            <div data-tour="dash-recommendations" style={{ maxWidth: 780, margin: '0 auto' }}>
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
                                    <tr key={post.postId}>
                                        <td style={{ fontWeight: 500 }}>{post.title}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                            <div>{new Date(post.createdAt).toLocaleDateString('ko-KR')}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{new Date(post.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td>
                                            {post.isPendingSchedule ? (
                                                <span style={{ color: 'var(--warning)', fontSize: 13, fontWeight: 600 }} title={`예약 시각: ${new Date(post.scheduledAt).toLocaleString('ko-KR')}`}>
                                                    예약됨 · {new Date(post.scheduledAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            ) : post.url ? (
                                                <a href={post.url} target="_blank" rel="noopener noreferrer"
                                                    style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                                    블로그 보기 →
                                                </a>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>처리 대기 중</span>
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
