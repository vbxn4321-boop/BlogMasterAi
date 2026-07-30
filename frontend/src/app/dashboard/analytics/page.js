"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { InlineAlert } from "@/components/ui";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { analyticsTourSteps } from "@/lib/onboardingSteps";

function RankBadge({ rank }) {
    const color = rank <= 10 ? 'var(--success)' : rank <= 30 ? 'var(--warning)' : 'var(--error)';
    const page = Math.ceil(rank / 10);
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{rank}</span>
            <span style={{ fontSize: 13, color, fontWeight: 700 }}>위</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>({page}p)</span>
        </div>
    );
}

export default function AnalyticsPage() {
    const supabase = createClient();
    const [accounts, setAccounts] = useState([]);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [lastSearched, setLastSearched] = useState('');

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: accs } = await supabase
                .from('naver_accounts')
                .select('id, naver_id')
                .eq('user_id', user.id)
                .order('naver_id');
            setAccounts(accs || []);
        };
        init();
    }, []);

    const getAccountName = (blogId) => {
        const acc = accounts.find(a =>
            a.naver_id.trim().split('@')[0].toLowerCase() === blogId.toLowerCase()
        );
        return acc ? acc.naver_id.trim().split('@')[0] : blogId;
    };

    const handleSearch = async (e) => {
        e?.preventDefault();
        const trimmed = searchKeyword.trim();
        if (!trimmed) return;

        setIsSearching(true);
        setSearchError('');
        setSearchResults(null);

        try {
            const res = await fetch('/api/rankings/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: trimmed })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '검색 중 오류가 발생했습니다.');
            setSearchResults(data.results || []);
            setLastSearched(trimmed);
        } catch (err) {
            setSearchError(err.message);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="animate-in">
            {/* 헤더 */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>순위 분석</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    키워드를 입력하면 해당 검색어에서 내 블로그 게시글이 몇 위인지 확인할 수 있습니다.
                    네이버 검색 API 기준, 1위~200위 내에서 탐색합니다.
                </p>
            </div>

            {/* 검색 입력 */}
            <form data-tour="rank-search-input" onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <input
                    type="text"
                    className="input-field"
                    placeholder="검색 키워드를 입력하세요 (예: 강남 맛집, 다이어트 방법)"
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    style={{ flex: 1, fontSize: 15 }}
                    disabled={isSearching}
                />
                <button
                    type="submit"
                    className="btn-primary"
                    disabled={isSearching || !searchKeyword.trim()}
                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {isSearching ? '검색 중...' : '순위 검색'}
                </button>
            </form>

            {/* 검색 결과 안내 문구 */}
            {searchResults !== null && !isSearching && (
                <div data-tour="rank-warning-banner" style={{ marginBottom: 16 }}>
                    <InlineAlert type="warning">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>⚠️</span>
                            <span>네이버 검색 API 기준으로 조회된 결과이며, 실제 네이버 검색 결과 값과는 차이가 있을 수 있습니다.</span>
                        </span>
                    </InlineAlert>
                </div>
            )}

            {/* 에러 */}
            {searchError && (
                <div style={{ marginBottom: 24 }}>
                    <InlineAlert type="error">{searchError}</InlineAlert>
                </div>
            )}

            {/* 검색 전 안내 */}
            {searchResults === null && !isSearching && !searchError && (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                        키워드를 검색해보세요
                    </div>
                    <div style={{ fontSize: 13 }}>
                        검색어를 입력하면 내 블로그 게시글이 해당 키워드에서 몇 위인지 바로 확인할 수 있습니다.
                    </div>
                </div>
            )}

            {/* 검색 중 로딩 */}
            {isSearching && (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <div>네이버 블로그 검색 API에서 1위~200위까지 순위를 확인하고 있습니다...</div>
                </div>
            )}

            {/* 검색 결과 */}
            {searchResults !== null && !isSearching && (
                <>
                    <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                            "{lastSearched}"
                        </span>
                        {' '}검색 결과 —{' '}
                        {searchResults.length > 0
                            ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>200위 내 {searchResults.length}개 발견</span>
                            : <span>순위에 존재하는 게시글이 없습니다.</span>
                        }
                    </div>

                    {searchResults.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: 40, marginBottom: 16 }}>😅</div>
                            <div style={{ fontSize: 14 }}>
                                순위에 존재하는 게시글이 없습니다.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 16 }}>
                            {searchResults.map((result, i) => (
                                <div key={i} {...(i === 0 ? { 'data-tour': 'rank-result-card' } : {})} className="glass-card" style={{ padding: 24, borderRadius: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>

                                        {/* 왼쪽: 게시글 정보 */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h3 style={{
                                                fontSize: 16, fontWeight: 700, marginBottom: 8,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                            }}>
                                                {result.title || '제목 없음'}
                                            </h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                                <span className="badge badge-pending">
                                                    @{getAccountName(result.blog_id)}
                                                </span>
                                                {result.postdate && (
                                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                        {result.postdate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}
                                                    </span>
                                                )}
                                            </div>
                                            {result.description && (
                                                <div style={{
                                                    fontSize: 13, color: 'var(--text-secondary)',
                                                    lineHeight: 1.6, marginBottom: 8,
                                                    overflow: 'hidden',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical'
                                                }}>
                                                    {result.description}
                                                </div>
                                            )}
                                            {result.link && (
                                                <a href={result.link} target="_blank" rel="noopener noreferrer"
                                                    style={{
                                                        fontSize: 12, color: 'var(--accent)',
                                                        textDecoration: 'none', opacity: 0.75
                                                    }}>
                                                    게시글 보기 →
                                                </a>
                                            )}
                                        </div>

                                        {/* 오른쪽: 순위 */}
                                        <div {...(i === 0 ? { 'data-tour': 'rank-badge' } : {})} style={{ flexShrink: 0, minWidth: 80, textAlign: 'right' }}>
                                            <RankBadge rank={result.rank} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            <OnboardingTour pageKey="analytics" steps={analyticsTourSteps} />
        </div>
    );
}
