export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 아래 5개 쿼리는 전부 user.id에만 의존하고 서로의 결과를 참조하지 않으므로 동시에 실행한다.
    // (rankings 조회만 publishedPosts의 글 id 목록이 있어야 해서 이 배치 뒤에 따로 실행)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
        { data: profile },
        { data: accounts },
        { data: publishedPosts },
        { data: recentPublished },
        { data: recentPosts },
        { data: monthlyPosts },
    ] = await Promise.all([
        supabase.from('profiles').select('plan_type').eq('id', user?.id).single(),
        supabase.from('naver_accounts').select('id, naver_id, concept, is_session_valid').eq('user_id', user?.id),
        // 계정별 "상위 노출 포스트" 집계용 — 발행 성공한 글 중 순위분석 탭에서 이미 확인된
        // 것만 대상으로 한다(대시보드 진입 시마다 네이버 API를 새로 호출하지 않기 위함).
        supabase.from('posts')
            .select('id, naver_account_id, naver_post_url, content_json')
            .eq('user_id', user?.id)
            .eq('status', 'success')
            .not('naver_post_url', 'is', null),
        // 계정별 "최근 발행 키워드" 집계용
        supabase.from('posts')
            .select('id, naver_account_id, topic, content_json, created_at')
            .eq('user_id', user?.id)
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(60),
        // 계정별 "최근 포스팅" 목록용 — 실패(failed)한 글은 제외. scheduled_at은 예약 발행
        // 여부와, 그 시각이 아직 안 지났으면 "예약됨"으로 표시하기 위해 필요하다.
        supabase.from('posts')
            .select('id, naver_account_id, topic, naver_post_url, created_at, content_json, scheduled_at')
            .eq('user_id', user?.id)
            .neq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(150),
        // 계정별 "이번 달 발행 통계"(총 발행 수 · 성공률)용 — 성공/실패 둘 다 필요하다.
        supabase.from('posts')
            .select('naver_account_id, status')
            .eq('user_id', user?.id)
            .in('status', ['success', 'failed'])
            .gte('created_at', startOfMonth.toISOString()),
    ]);

    const isSubscribed = profile?.plan_type === 'pro';

    const publishedPostIds = (publishedPosts || []).map(p => p.id);
    const { data: rankingRows } = publishedPostIds.length > 0
        ? await supabase
            .from('rankings')
            .select('post_id, keyword, rank_position, checked_at')
            .in('post_id', publishedPostIds)
            .order('checked_at', { ascending: false })
        : { data: [] };

    // post_id별 최신 순위 1건만 남긴다(checked_at 내림차순 정렬이라 처음 만난 게 최신)
    const latestRankByPostId = new Map();
    for (const row of (rankingRows || [])) {
        if (!latestRankByPostId.has(row.post_id)) latestRankByPostId.set(row.post_id, row);
    }

    const rankingsByAccount = {};
    for (const post of (publishedPosts || [])) {
        const ranking = latestRankByPostId.get(post.id);
        if (!ranking) continue;
        const accId = post.naver_account_id;
        if (!rankingsByAccount[accId]) rankingsByAccount[accId] = [];
        rankingsByAccount[accId].push({
            postId: post.id,
            title: post.content_json?.title || '(제목 없음)',
            keyword: ranking.keyword,
            rank: ranking.rank_position,
            checkedAt: ranking.checked_at,
        });
    }
    Object.values(rankingsByAccount).forEach(list => list.sort((a, b) => a.rank - b.rank));

    // 계정별 "순위 추이" — 각 계정의 상위 노출 포스트(순위가 가장 좋은 글) 하나를 골라
    // 그 글의 순위 체크 이력 전체(rankingRows에 이미 다 들어있음)를 시간순으로 뽑아 스파크라인 데이터로 만든다.
    const rankTrendByAccount = {};
    for (const [accId, list] of Object.entries(rankingsByAccount)) {
        const topPost = list[0];
        if (!topPost) continue;
        const history = (rankingRows || [])
            .filter(r => r.post_id === topPost.postId)
            .sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
        if (history.length === 0) continue;
        const points = history.map(r => ({ date: r.checked_at, rank: r.rank_position }));
        const currentRank = points[points.length - 1].rank;
        const previousRank = points.length > 1 ? points[points.length - 2].rank : null;
        rankTrendByAccount[accId] = {
            title: topPost.title,
            keyword: topPost.keyword,
            points,
            currentRank,
            delta: previousRank != null ? previousRank - currentRank : null, // 양수면 순위 상승(개선)
        };
    }

    // 계정별 "이번 달 발행 통계"
    const monthlyStatsByAccount = {};
    for (const post of (monthlyPosts || [])) {
        const accId = post.naver_account_id;
        if (!monthlyStatsByAccount[accId]) monthlyStatsByAccount[accId] = { total: 0, success: 0 };
        monthlyStatsByAccount[accId].total += 1;
        if (post.status === 'success') monthlyStatsByAccount[accId].success += 1;
    }
    Object.values(monthlyStatsByAccount).forEach(s => {
        s.successRate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
    });

    // 계정별 "최근 발행 키워드" 집계. 우선순위:
    // 1) content_json.data_asset.target_keywords.main — AI가 원고 생성 시 실제로 분석해서 고른 키워드
    //    (사용자가 "핵심 키워드" 입력칸을 비워둔 경우에도 여기엔 항상 채워짐)
    // 2) topic JSON의 main_keyword — 사용자가 직접 입력한 값
    // 3) topic 원문 앞부분 — 위 둘 다 없을 때의 최후 폴백. URL/원문 통째로 붙여넣는 계정은
    //    이 부분이 수천 자짜리 원문일 수 있으므로 안전하게 잘라서 보여준다.
    const extractKeyword = (post) => {
        const aiKeyword = post.content_json?.data_asset?.target_keywords?.main;
        if (aiKeyword) return aiKeyword;

        const rawTopic = post.topic;
        if (!rawTopic) return null;
        let keyword = rawTopic.split('|||')[0]?.trim();
        if (rawTopic.includes('|||')) {
            try {
                const cfg = JSON.parse(rawTopic.split('|||')[1]);
                if (cfg.main_keyword) keyword = cfg.main_keyword;
            } catch (e) { /* 파싱 실패 시 원본 텍스트 사용 */ }
        }
        if (keyword && keyword.length > 30) keyword = keyword.slice(0, 30) + '…';
        return keyword || null;
    };

    const keywordsByAccount = {};
    for (const post of (recentPublished || [])) {
        const accId = post.naver_account_id;
        if (!keywordsByAccount[accId]) keywordsByAccount[accId] = [];
        if (keywordsByAccount[accId].length >= 5) continue;
        const keyword = extractKeyword(post);
        if (!keyword) continue;
        keywordsByAccount[accId].push({ postId: post.id, keyword, createdAt: post.created_at });
    }

    // 계정별 "최근 포스팅" 목록 — 실패(failed)한 글은 이미 위 쿼리에서 제외됐고, 최근 10개씩만 담는다.
    // 예약 발행은 우리 쪽에서는 이미 완료(success)됐지만, 실제로는 지정한 시각에 네이버가
    // 대신 발행해준다 — 그 시각이 아직 안 지났으면 "블로그 보기" 대신 "예약됨"으로 보여준다.
    const postsByAccount = {};
    for (const post of (recentPosts || [])) {
        const accId = post.naver_account_id;
        if (!postsByAccount[accId]) postsByAccount[accId] = [];
        if (postsByAccount[accId].length >= 10) continue;
        const displayTitle = post.content_json?.title || post.topic?.split('|||')[0] || '(제목 없음)';
        const isPendingSchedule = !!post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now();
        postsByAccount[accId].push({
            postId: post.id,
            title: displayTitle,
            url: post.naver_post_url,
            createdAt: post.created_at,
            scheduledAt: post.scheduled_at,
            isPendingSchedule,
        });
    }

    return (
        <div className="animate-in">
            <div style={{
                position: 'relative', overflow: 'hidden',
                background: 'var(--gradient-1)', borderRadius: 'var(--radius-lg)',
                padding: '28px 32px', marginBottom: 28, color: '#fff',
            }}>
                <div style={{
                    position: 'absolute', top: -60, right: -40, width: 220, height: 220,
                    borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
                }} />
                <div style={{
                    position: 'absolute', bottom: -80, right: 120, width: 160, height: 160,
                    borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{ position: 'relative' }}>
                    <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>대시보드</h1>
                    <p style={{ fontSize: 14, opacity: 0.9 }}>
                        {user?.email}님, 환영합니다.
                    </p>
                </div>
            </div>

            <DashboardClient
                accounts={accounts || []}
                rankingsByAccount={rankingsByAccount}
                keywordsByAccount={keywordsByAccount}
                postsByAccount={postsByAccount}
                rankTrendByAccount={rankTrendByAccount}
                monthlyStatsByAccount={monthlyStatsByAccount}
                isSubscribed={isSubscribed}
            />
        </div>
    );
}
