const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws');

require('dotenv').config();

// Railway 배포 환경(Node 20)은 네이티브 WebSocket이 없어서, realtime transport를
// 명시적으로 넘겨주지 않으면 createClient() 자체가 크래시함 (engine_api.js와 동일 처리)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { transport: ws } }
);

class Scheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Start the scheduler — checks for pending/scheduled posts every minute
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('[Scheduler] Starting scheduler...');

        // ── 아래 3개는 현재 사용하지 않는 기능이라 비활성화 (2026-07-03) ──
        // - checkScheduledPosts: 예약 발행 관리 화면이 비활성화 상태(schedule/page.js가 return null)이고,
        //   이걸 켜면 폐기된 Puppeteer 직접 로그인 경로(/api/posts/trigger → module4_executor.js)가 되살아나
        //   네이버 계정이 캡차/이상 로그인으로 잠길 위험이 있음. 발행은 전부 Chrome 확장프로그램 방식으로 전환됨.
        // - runRankingCheck: rankings 테이블을 읽는 화면이 없음(analytics 페이지는 매번 실시간 검색 API로 대체됨).
        //   보여줄 곳 없는 데이터를 위해 매일 네이버를 스크래핑하는 리스크만 남아 있어 비활성화.
        //
        // // Check for scheduled posts every minute
        // cron.schedule('* * * * *', async () => {
        //     await this.checkScheduledPosts();
        // });

        // Check for immediate (pending) posts every 30 seconds
        // (현재 즉시발행은 프론트에서 /api/post/prepare-extension을 직접 호출해 처리되므로
        //  이 폴러는 대부분 빈손이지만, 무해한 안전망 성격이라 유지)
        cron.schedule('*/30 * * * * *', async () => {
            await this.checkPendingPosts();
        });

        // // SEO ranking scrape — daily at 06:00 AM KST
        // cron.schedule('0 6 * * *', async () => {
        //     await this.runRankingCheck();
        // }, { timezone: 'Asia/Seoul' });

        // 키워드 경쟁지수(포화도) 주간 배치 — 매주 월요일 05:00 KST
        cron.schedule('0 5 * * 1', async () => {
            await this.runWeeklyKeywordBatch();
        }, { timezone: 'Asia/Seoul' });

        // 컨셉별 추천 키워드 풀(Gemini 100개) 월간 전량 재생성 — 매월 1일 06:00 KST
        cron.schedule('0 6 1 * *', async () => {
            await this.runMonthlyConceptKeywordGeneration();
        }, { timezone: 'Asia/Seoul' });

        // 정기결제(빌링키) 자동 청구 — 매일 04:00 KST
        cron.schedule('0 4 * * *', async () => {
            await this.runSubscriptionBilling();
        }, { timezone: 'Asia/Seoul' });

        // 텔레그램 시간대별 발행 제안 — 사용자가 설정 화면에서 직접 고른 시각(HH:MM, KST)에
        // 맞춰 매분 체크한다. 실제 시간대 매칭은 checkTelegramSchedules() 안에서
        // Intl.DateTimeFormat으로 KST를 직접 계산해서 처리 (cron의 timezone 옵션은
        // '* * * * *' 패턴 자체에는 영향이 없음 — 매분 그냥 실행됨).
        cron.schedule('* * * * *', async () => {
            await this.checkTelegramSchedules();
        }, { timezone: 'Asia/Seoul' });

        // 발행 정체 감시 — 5분마다. 순수 간격 실행이라 timezone 옵션은 필요 없음.
        cron.schedule('*/5 * * * *', async () => {
            await this.checkStuckExtensionJobs();
        });

        console.log('[Scheduler] Cron jobs registered:');
        console.log('  ⚡ Pending posts check: every 30 seconds (safety net)');
        console.log('  🔑 Weekly keyword batch: every Monday 05:00 KST');
        console.log('  🧠 Monthly concept keyword pool (Gemini): 1st of month 06:00 KST');
        console.log('  💳 Subscription billing: daily 04:00 KST');
        console.log('  📢 Telegram schedule check: every minute (per-user configured times)');
        console.log('  🚨 Stuck publish watchdog: every 5 minutes');
        console.log('  (scheduled posts check, ranking scrape: disabled — see comments)');
    }

    /**
     * Check for posts that are scheduled (now triggered immediately for Naver-side scheduling)
     */
    async checkScheduledPosts() {
        // No longer waiting for 'now' — trigger immediately so AI can generate content/images
        const { data: scheduledPosts, error } = await supabase
            .from('posts')
            .select('id, topic, scheduled_at')
            .eq('status', 'scheduled')
            .order('created_at', { ascending: true })
            .limit(1);

        if (error || !scheduledPosts?.length) return;

        for (const post of scheduledPosts) {
            console.log(`[Scheduler] Triggering scheduled post for Naver-side reservation: ${post.topic}`);
            await this.triggerPost(post.id);
        }
    }

    /**
     * Check for immediate posts (status: 'pending')
     */
    async checkPendingPosts() {
        const { data: pendingPosts, error } = await supabase
            .from('posts')
            .select('id, topic')
            .eq('status', 'pending')
            .is('extension_device_id', null)
            .order('created_at', { ascending: true })
            .limit(1);

        if (error || !pendingPosts?.length) return;

        for (const post of pendingPosts) {
            console.log(`[Scheduler] Triggering pending post: ${post.topic}`);
            await this.triggerPost(post.id);
        }
    }

    /**
     * Trigger a post via the Engine API
     */
    async triggerPost(postId) {
        try {
            const port = process.env.PORT || process.env.ENGINE_PORT || 4000;
            const response = await fetch(`http://localhost:${port}/api/posts/trigger`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-engine-secret': process.env.ENGINE_API_SECRET,
                },
                body: JSON.stringify({ post_id: postId }),
            });

            const result = await response.json();
            console.log(`[Scheduler] Trigger result: ${JSON.stringify(result)}`);
        } catch (err) {
            console.error(`[Scheduler] Trigger failed: ${err.message}`);
        }
    }

    /**
     * Run SEO ranking check for all successful posts
     */
    async runRankingCheck() {
        console.log('[Scheduler] Starting daily ranking check...');

        // Get all successful posts that are at least 24h old
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: posts, error } = await supabase
            .from('posts')
            .select('id, topic, naver_post_url, naver_accounts(naver_id)')
            .eq('status', 'success')
            .lte('completed_at', oneDayAgo);

        if (error || !posts?.length) {
            console.log('[Scheduler] No posts eligible for ranking check.');
            return;
        }

        const RankingScraper = require('./module6_ranking');
        const scraper = new RankingScraper();

        for (const post of posts) {
            try {
                const rawTopic = post.topic || '';
                let keyword = rawTopic.split('|||')[0];
                if (rawTopic.includes('|||')) {
                    try {
                        const keywordConfig = JSON.parse(rawTopic.split('|||')[1]);
                        keyword = keywordConfig.main_keyword || keyword;
                    } catch (e) {}
                }
                const blogId = post.naver_accounts?.naver_id?.trim().split('@')[0];

                if (!keyword || !blogId) continue;

                // 오늘 이미 체크된 데이터가 있으면 스킵
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const { data: existingToday } = await supabase
                    .from('rankings')
                    .select('id')
                    .eq('post_id', post.id)
                    .gte('checked_at', todayStart.toISOString())
                    .limit(1);

                if (existingToday && existingToday.length > 0) {
                    console.log(`[Scheduler] 오늘 이미 체크됨, 스킵: "${keyword}"`);
                    continue;
                }

                console.log(`[Scheduler] Checking rank for: "${keyword}" (blog: ${blogId})`);
                const result = await scraper.checkRank(keyword, blogId);

                if (result) {
                    await supabase.from('rankings').insert({
                        post_id: post.id,
                        keyword: keyword,
                        rank_position: result.position,
                        search_page: result.page,
                        total_results: result.totalResults,
                    });
                    console.log(`[Scheduler] Rank recorded: #${result.position} (Page ${result.page})`);

                    // 30일 초과 데이터 삭제
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    await supabase
                        .from('rankings')
                        .delete()
                        .eq('post_id', post.id)
                        .lt('checked_at', thirtyDaysAgo);
                }
            } catch (err) {
                console.error(`[Scheduler] Ranking check failed for post ${post.id}: ${err.message}`);
            }
        }

        console.log('[Scheduler] Daily ranking check complete.');
    }

    /**
     * 키워드 경쟁지수 개선 배치 (v6 스펙 §5) — 그리드 32개 컨셉 + 실제 계정 컨셉의 연관키워드
     * 스냅샷을 뜨고, blog_total_cache에 신선한(30일 이내) 값이 없는 키워드만 새로 조회한다.
     * AD API 실시간 호출(/api/recommendations)과는 무관 — 이 배치는 blog_total만 미리 채워두는 용도.
     */
    async runWeeklyKeywordBatch() {
        console.log('[Scheduler] Starting weekly keyword batch...');

        const naverAdAPI = require('./naver_ad_api');
        const KeywordEngine = require('./keyword_analysis');
        const utils = require('./utils');
        const _ = require('lodash');
        const keywordEngine = new KeywordEngine();

        // 그리드 50개 고정 목록 (accounts/page.js:6-23의 NAVER_CATEGORIES와 정확히 일치시킬 것 —
        // 여기가 어긋나면 그리드에서 고를 수 있는 컨셉인데도 조사 대상에서 빠지는 문제가 재발함)
        // 예전엔 "미술·디자인"처럼 두 주제를 한 항목으로 묶었으나, 각각 독립적으로
        // 조회·추천되도록 전부 단일 항목으로 분리함
        const GRID_CONCEPTS = [
            '문학', '책', '영화', '미술', '디자인', '공연', '전시', '음악', '드라마', '스타', '연예인', '만화', '애니', '방송',
            '일상', '생각', '육아', '결혼', '반려동물', '좋은글', '이미지', '패션', '미용', '인테리어', 'DIY', '요리', '레시피', '상품리뷰', '원예', '재배',
            '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
            'IT', '컴퓨터', '사회', '정치', '건강', '의학', '비즈니스', '경제', '어학', '외국어', '교육', '학문',
        ];

        // 그리드 32개 + 실제 계정에 쓰이고 있는 concept(그리드 밖 예전 자유입력 값 대비 안전장치)을 합친다.
        const { data: accountRows, error: accountErr } = await supabase
            .from('naver_accounts')
            .select('concept');
        if (accountErr) {
            console.error(`[Scheduler] Failed to load account concepts: ${accountErr.message}`);
            return;
        }
        const accountConcepts = (accountRows || []).map(a => a.concept).filter(Boolean);
        const CONCEPTS = [...new Set([...GRID_CONCEPTS, ...accountConcepts])];

        const today = new Date().toISOString().split('T')[0];
        const allCurrentKeywords = new Set();

        for (const concept of CONCEPTS) {
            try {
                const conceptKeyword = concept.split('·')[0].trim(); // engine_api.js:507과 동일한 방식
                const stats = await naverAdAPI.getKeywordStats([conceptKeyword]);
                if (stats && stats.length > 0) {
                    const rows = stats.map(k => ({
                        snapshot_date: today,
                        concept,
                        keyword: utils.normalizeKeyword(k.relKeyword),
                        search_volume: (parseInt(k.monthlyPcQcCnt) || 0) + (parseInt(k.monthlyMobileQcCnt) || 0),
                        comp_idx: k.compIdx || null,
                    }));

                    rows.forEach(r => allCurrentKeywords.add(r.keyword));

                    const { error } = await supabase
                        .from('keyword_snapshot')
                        .upsert(rows, { onConflict: 'snapshot_date,concept,keyword', ignoreDuplicates: true });
                    if (error) console.error(`[Scheduler] Snapshot insert failed for "${concept}": ${error.message}`);
                }
            } catch (err) {
                console.error(`[Scheduler] Weekly batch failed for concept "${concept}": ${err.message}`);
            }

            // 검색광고 API 연속 호출 속도 제한 대응 (컨셉이 32개로 늘어나 안전하게 약간의 텀을 둠)
            await new Promise(r => setTimeout(r, 300));
        }

        // "지난주 대비 신규냐"가 아니라 "지금 blog_total_cache에 이미 신선한 값이 있냐"만으로
        // 조회 여부를 판단한다. 이렇게 하면 같은 날 배치를 여러 번 돌려도(예: 컨셉이 중간에
        // 추가된 경우 재실행) 이미 처리된 키워드를 또 조회하는 낭비가 생기지 않는다.
        // 키워드가 많으면(수백~수천 개) .in()에 전부 넣을 경우 요청 URL이 헤더 크기 제한을
        // 넘겨 통째로 실패하므로, 100개씩 나눠서 조회 후 합친다.
        const allKeywordsArr = [...allCurrentKeywords];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        // 청크마다 서로 의존하지 않는 단순 조회라 순차 대기 없이 동시에 보낸다
        // (네이버 API 호출이 아니라 우리 DB 조회라 속도 제한과 무관)
        const freshChunkResults = await Promise.all(
            _.chunk(allKeywordsArr, 100).map(batch =>
                supabase.from('blog_total_cache').select('keyword').in('keyword', batch).gte('updated_at', thirtyDaysAgo)
            )
        );
        const freshSet = new Set();
        freshChunkResults.forEach(({ data, error }) => {
            if (error) {
                console.error(`[Scheduler] blog_total_cache freshness check failed: ${error.message}`);
                return;
            }
            if (data) data.forEach(r => freshSet.add(r.keyword));
        });
        const toFetch = allKeywordsArr.filter(k => !freshSet.has(k));

        console.log(`[Scheduler] Weekly batch: ${allKeywordsArr.length} keywords total, ${toFetch.length} need blog_total fetch (already fresh=${freshSet.size})`);

        if (toFetch.length === 0) {
            console.log('[Scheduler] Weekly keyword batch complete (no new fetches needed).');
            return;
        }

        const results = await keywordEngine.fetchBlogTotalsBatch(toFetch);

        // 실패한 조회(API 에러/할당량 초과 등)는 '0'으로 잘못 캐싱하지 않고 건너뛴다.
        // → 다음 배치 때 다시 시도되도록 '측정중' 상태로 남겨둠 (실패=안전함 오표시 방지)
        const failed = results.filter(r => !r.success);
        const succeeded = results.filter(r => r.success);
        if (failed.length > 0) {
            console.warn(`[Scheduler] ${failed.length}개 키워드 blog_total 조회 실패 — 캐시에 저장하지 않고 건너뜀(측정중 유지): ${failed.slice(0, 10).map(r => r.keyword).join(', ')}${failed.length > 10 ? ' 외' : ''}`);
        }

        if (succeeded.length === 0) {
            console.log('[Scheduler] Weekly keyword batch complete (성공한 조회 없음, upsert 생략).');
            return;
        }

        const upsertRows = succeeded.map(r => ({
            keyword: r.keyword,
            blog_total: r.total,
            updated_at: new Date().toISOString(),
        }));
        const { error: upsertErr } = await supabase
            .from('blog_total_cache')
            .upsert(upsertRows, { onConflict: 'keyword' });
        if (upsertErr) console.error(`[Scheduler] blog_total_cache upsert failed: ${upsertErr.message}`);

        console.log(`[Scheduler] Weekly keyword batch complete. ${upsertRows.length}개 성공적으로 업데이트, ${failed.length}개 실패(측정중 유지).`);
    }

    /**
     * 컨셉별 추천 키워드 풀 월간 재생성 — concept_keyword_pool을 Gemini 100개로 매달 전량 교체한다.
     * 그리드 전체(48개)가 아니라 "실제 계정들이 지금 쓰고 있는 컨셉"만 대상으로 한다 — 아직 아무도
     * 쓰지 않는 컨셉까지 매달 Gemini/네이버 API를 호출하는 낭비를 막기 위함.
     * 신규 컨셉이 실시간으로 필요한 경우(사용자가 방금 새 컨셉을 선택)는 이 배치를 기다리지 않고
     * engine_api.js의 /api/recommendations가 같은 함수를 온디맨드로 직접 호출한다.
     */
    async runMonthlyConceptKeywordGeneration() {
        console.log('[Scheduler] Starting monthly concept keyword pool generation...');

        const { data: accountRows, error: accountErr } = await supabase
            .from('naver_accounts')
            .select('concept');
        if (accountErr) {
            console.error(`[Scheduler] Failed to load account concepts: ${accountErr.message}`);
            return;
        }
        const concepts = [...new Set((accountRows || []).map(a => a.concept).filter(Boolean))];
        console.log(`[Scheduler] ${concepts.length}개 컨셉 대상: ${concepts.join(', ')}`);

        const KeywordEngine = require('./keyword_analysis');
        const keywordEngine = new KeywordEngine(process.env.GEMINI_API_KEY);

        let successCount = 0;
        let failCount = 0;
        for (const concept of concepts) {
            try {
                await keywordEngine.generateConceptKeywordPool(concept);
                successCount++;
            } catch (err) {
                failCount++;
                console.error(`[Scheduler] "${concept}" 키워드 풀 생성 실패: ${err.message}`);
            }
            // Gemini + 네이버 API 연속 호출 사이 텀 (컨셉 단위 레이트리밋 대응)
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`[Scheduler] Monthly concept keyword pool generation complete. 성공 ${successCount}개, 실패 ${failCount}개.`);
    }

    /**
     * PortOne 정기결제 자동 청구 — 매일 04:00 KST.
     * 1) status='active'이고 current_period_end가 지난 구독: 빌링키로 재청구 후 기간 연장, 실패 시 past_due+강등
     * 2) status='canceled'이고 current_period_end가 지난 구독: 청구 없이 강등만(사용자가 취소했으므로)
     */
    async runSubscriptionBilling() {
        console.log('[Scheduler] Starting subscription billing run...');

        const nowIso = new Date().toISOString();
        const fallbackAmount = parseInt(process.env.PORTONE_PRO_PLAN_PRICE, 10);

        // 등급별 가격 조회 — 관리자가 /admin/subscriptions에서 가격을 바꾸면 다음 재청구부터
        // 바로 반영되도록, 청구 시점마다 subscription_plans를 새로 조회한다(캐시하지 않음).
        const { data: planRows } = await supabase
            .from('subscription_plans')
            .select('plan_key, price');
        const priceByPlan = new Map((planRows || []).map(p => [p.plan_key, p.price]));

        // 1) 취소된 구독 중 기간 만료분 → 강등만
        const { data: expiredCanceled } = await supabase
            .from('subscriptions')
            .select('id, user_id')
            .eq('status', 'canceled')
            .lte('current_period_end', nowIso);

        for (const sub of expiredCanceled || []) {
            await supabase.from('profiles').update({ plan_type: 'free' }).eq('id', sub.user_id);
            console.log(`[Scheduler] 취소된 구독 만료 → free 강등: user=${sub.user_id}`);
        }

        // 2) 활성 구독 중 결제일 도래분 → 재청구
        const { data: dueSubs, error } = await supabase
            .from('subscriptions')
            .select('id, user_id, portone_billing_key_id, current_period_end')
            .eq('status', 'active')
            .lte('current_period_end', nowIso);

        if (error) {
            console.error(`[Scheduler] 구독 조회 실패: ${error.message}`);
            return;
        }
        if (!dueSubs?.length) {
            console.log('[Scheduler] Subscription billing: 재청구 대상 없음.');
            return;
        }

        const { data: subProfiles } = await supabase
            .from('profiles')
            .select('id, plan_type, override_price')
            .in('id', dueSubs.map(s => s.user_id));
        const profileByUser = new Map((subProfiles || []).map(p => [p.id, p]));

        const billing = require('./billing');

        for (const sub of dueSubs) {
            const userProfile = profileByUser.get(sub.user_id);
            const userPlan = userProfile?.plan_type;
            // 컴퍼니는 요금제 공통 가격표 대신 그 회사 전용으로 설정해둔 override_price를 우선 사용
            const amount = (userPlan === 'company' && userProfile?.override_price)
                ? userProfile.override_price
                : (priceByPlan.get(userPlan) ?? fallbackAmount);
            if (!amount) {
                console.error(`[Scheduler] 요금제 가격을 찾을 수 없어 재청구 건너뜀: user=${sub.user_id}, plan=${userPlan || '알수없음'}`);
                continue;
            }
            const paymentId = `sub_${sub.user_id}_${Date.now()}`;
            const charge = await billing.chargeBillingKey({
                billingKeyId: sub.portone_billing_key_id, paymentId, userId: sub.user_id, amount,
            });

            if (charge.success) {
                const nextPeriodEnd = new Date(sub.current_period_end);
                nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
                await supabase.from('subscriptions').update({
                    current_period_end: nextPeriodEnd.toISOString(), updated_at: new Date().toISOString(),
                }).eq('id', sub.id);
                await supabase.from('subscription_payments').insert({
                    user_id: sub.user_id, subscription_id: sub.id, portone_payment_id: paymentId,
                    amount, status: 'paid',
                });
                console.log(`[Scheduler] 재청구 성공: user=${sub.user_id}, next=${nextPeriodEnd.toISOString()}`);
            } else {
                await supabase.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
                await supabase.from('profiles').update({ plan_type: 'free' }).eq('id', sub.user_id);
                await supabase.from('subscription_payments').insert({
                    user_id: sub.user_id, subscription_id: sub.id, portone_payment_id: paymentId,
                    amount, status: 'failed', failure_reason: charge.failureReason,
                });
                console.warn(`[Scheduler] 재청구 실패 → past_due+free 강등: user=${sub.user_id}, reason=${charge.failureReason}`);
            }

            // PortOne API 연속 호출 속도 제한 대응
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`[Scheduler] Subscription billing run complete. ${dueSubs.length}건 처리.`);
    }

    /**
     * 텔레그램 시간대별 발행 제안 — 매분 실행되어 "지금이 그 사용자가 설정한 슬롯 시각과
     * 일치하는가"를 확인한다. 슬롯은 사용자당 여러 개일 수 있고(telegram_schedule_slots),
     * 계정/기본값(telegram_schedule_settings)은 둘 다 profiles.id에만 FK가 걸려있어 서로
     * 직접 조인이 안 되므로 슬롯을 먼저 조회한 뒤 관련 user_id로 따로 조회해서 합친다.
     * KST 기준 'HH:MM'/'YYYY-MM-DD'는 여기서 직접 계산한다 (node-cron의 timezone 옵션은
     * '* * * * *' 패턴 자체엔 영향이 없음).
     */
    async checkTelegramSchedules() {
        const nowKST = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date()); // 'HH:MM'
        const todayKST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()); // 'YYYY-MM-DD'

        // 오늘 아직 발송 안 한(last_sent_date가 NULL이거나 오늘이 아닌) 슬롯만 조회 — .neq()만
        // 쓰면 한 번도 안 보낸 슬롯이 SQL NULL 비교 규칙 때문에 걸러져서 영영 못 보내는 문제가
        // 생기므로 .or()로 NULL도 포함시킨다.
        const { data: slots, error } = await supabase
            .from('telegram_schedule_slots')
            .select('id, user_id, mode, time, message_template')
            .eq('enabled', true)
            .eq('time', nowKST)
            .or(`last_sent_date.is.null,last_sent_date.neq.${todayKST}`);

        if (error) {
            console.error(`[Scheduler] 텔레그램 슬롯 조회 실패: ${error.message}`);
            return;
        }
        if (!slots?.length) return;

        const userIds = [...new Set(slots.map(s => s.user_id))];
        const [{ data: settingsRows }, { data: profileRows }] = await Promise.all([
            supabase.from('telegram_schedule_settings')
                .select('user_id, naver_account_id, default_tone, default_category, default_custom_instructions')
                .in('user_id', userIds),
            supabase.from('profiles').select('id, telegram_chat_id').in('id', userIds),
        ]);
        const settingsMap = new Map((settingsRows || []).map(s => [s.user_id, s]));
        const chatIdMap = new Map((profileRows || []).map(p => [p.id, p.telegram_chat_id]));

        for (const slot of slots) {
            const settings = settingsMap.get(slot.user_id);
            const chatId = chatIdMap.get(slot.user_id);
            if (!chatId || !settings?.naver_account_id) {
                console.log(`[Scheduler] 슬롯 스킵(연동 해제/계정 미설정): slot=${slot.id}, user=${slot.user_id}`);
                continue;
            }

            try {
                // ⚠️ 반드시 slot.id 기준으로 찍는다 — user_id 기준으로 하면 그 사용자의 다른
                // 슬롯까지 같이 "오늘 보냄"으로 찍혀서 나중 시각 슬롯이 조용히 씹히는 버그가 생김.
                await supabase.from('telegram_schedule_slots')
                    .update({ last_sent_date: todayKST }).eq('id', slot.id);

                if (slot.mode === 'suggest') await this.runSuggestSlot(slot, settings, chatId);
                else await this.runDraftApprovalSlot(slot, settings, chatId);
            } catch (err) {
                console.error(`[Scheduler] 슬롯 처리 실패: slot=${slot.id}, user=${slot.user_id}, ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }
    }

    /**
     * "제안형" 슬롯: 키워드만 추천해서 제안하고, 실제 생성은 사용자가 "예"를 눌렀을 때
     * (engine_api.js의 handleSuggestCallback에서) 시작한다.
     */
    async runSuggestSlot(slot, settings, chatId) {
        const telegramBot = require('./telegram_bot');
        const port = process.env.PORT || process.env.ENGINE_PORT || 4000;

        const recRes = await fetch(`http://localhost:${port}/api/recommendations?account_id=${settings.naver_account_id}&user_id=${slot.user_id}`);
        const rec = await recRes.json();
        const top = rec?.keywords?.[0];
        if (!top) {
            console.log(`[Scheduler] suggest: 추천 키워드 없음, slot=${slot.id}, user=${slot.user_id}`);
            return;
        }

        const topic = `${top.keyword}|||${JSON.stringify({
            main_keyword: top.keyword,
            seo_category: settings.default_tone,
            custom_instructions: settings.default_custom_instructions,
            image_source: 'gemini',
        })}`;

        // status는 절대 'pending'을 쓰지 않는다 — checkPendingPosts()의 30초 안전망 폴러가
        // 옛 Puppeteer 발행 경로로 낚아채는 것을 막기 위함 (사용자 승인 전에 발행되면 안 됨).
        const { data: post, error } = await supabase.from('posts').insert({
            user_id: slot.user_id, naver_account_id: settings.naver_account_id,
            trigger_type: 'manual', topic, category: settings.default_category,
            status: 'telegram_suggested',
            content_json: { _trigger_type: 'manual', image_source: 'gemini' },
        }).select('id').single();
        if (error) {
            console.error(`[Scheduler] suggest post insert 실패: ${error.message}`);
            return;
        }

        const text = slot.message_template.replaceAll('{keyword}', top.keyword);
        await telegramBot.sendMessageWithButtons(chatId, text, [
            { text: '발행하기', callback_data: `suggest:${post.id}:yes` },
            { text: '취소', callback_data: `suggest:${post.id}:no` },
        ]);
    }

    /**
     * "완성형" 슬롯: 키워드 추천 후 원고까지 미리 완성해두고(hold_for_approval), 제목으로
     * 승인만 받는다. /api/extension/prepare는 비동기(fire-and-forget)라 완료를 폴링해야
     * 제목을 얻을 수 있다.
     */
    async runDraftApprovalSlot(slot, settings, chatId) {
        const telegramBot = require('./telegram_bot');
        const port = process.env.PORT || process.env.ENGINE_PORT || 4000;

        const recRes = await fetch(`http://localhost:${port}/api/recommendations?account_id=${settings.naver_account_id}&user_id=${slot.user_id}`);
        const rec = await recRes.json();
        const top = rec?.keywords?.[0];
        if (!top) {
            console.log(`[Scheduler] draft_approval: 추천 키워드 없음, slot=${slot.id}, user=${slot.user_id}`);
            return;
        }

        const topic = `${top.keyword}|||${JSON.stringify({
            main_keyword: top.keyword,
            seo_category: settings.default_tone,
            custom_instructions: settings.default_custom_instructions,
            image_source: 'gemini',
        })}`;

        const { data: post, error } = await supabase.from('posts').insert({
            user_id: slot.user_id, naver_account_id: settings.naver_account_id,
            trigger_type: 'manual', topic, category: settings.default_category,
            status: 'generating', // 'pending' 아님 — prepare 라우트가 어차피 다시 generating으로 찍음
            content_json: { _trigger_type: 'manual', image_source: 'gemini' },
        }).select('id').single();
        if (error) {
            console.error(`[Scheduler] draft_approval post insert 실패: ${error.message}`);
            return;
        }

        fetch(`http://localhost:${port}/api/extension/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-engine-secret': process.env.ENGINE_API_SECRET },
            body: JSON.stringify({ post_id: post.id, hold_for_approval: true }),
        }).catch(err => console.error(`[Scheduler] draft_approval prepare 호출 실패: ${err.message}`));

        // prepare()는 비동기라 여기서 완료(또는 실패)까지 최대 90초간 5초 간격으로 폴링한다.
        const deadline = Date.now() + 90_000;
        let finalPost = null;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 5000));
            const { data } = await supabase.from('posts').select('status, content_json').eq('id', post.id).single();
            if (data?.status === 'draft_pending_approval' || data?.status === 'failed') {
                finalPost = data;
                break;
            }
        }

        if (!finalPost || finalPost.status === 'failed') {
            console.error(`[Scheduler] draft_approval: 원고 생성 실패/타임아웃, post=${post.id}`);
            await telegramBot.sendMessage(chatId, '원고 생성 중 문제가 발생해 오늘은 건너뛰었습니다.');
            return;
        }

        const title = finalPost.content_json?.title || top.keyword;
        const text = slot.message_template.replaceAll('{title}', title);
        await telegramBot.sendMessageWithButtons(chatId, text, [
            { text: '발행하기', callback_data: `draft:${post.id}:yes` },
            { text: '취소', callback_data: `draft:${post.id}:no` },
        ]);
    }

    /**
     * 발행 정체 감시 — /api/extension/prepare와 /api/posts/trigger 양쪽에서 세팅되는
     * stuck_check_since를 기준으로, 'generating'/'pending_extension'/'posting' 상태로
     * 10분 넘게 멈춰있는 글을 찾아 텔레그램으로 알린다. telegram_suggested/
     * draft_pending_approval(사람 승인 대기 중)은 대상에서 제외 — created_at이 아니라
     * stuck_check_since를 쓰는 이유가 바로 이 오탐을 막기 위함이다.
     * stuck_notified_at은 같은 정체 에피소드에 대한 중복 알림만 막고, 리셋하지 않는다 —
     * 글이 terminal 상태(success/failed/cancelled)로 빠지면 status IN(...) 자체에서
     * 자연히 제외되므로 플래그 값은 더 이상 의미가 없어진다.
     */
    async checkStuckExtensionJobs() {
        const threshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

        const { data: stuckPosts, error } = await supabase
            .from('posts')
            .select('id, user_id, topic')
            .in('status', ['generating', 'pending_extension', 'posting'])
            .not('stuck_check_since', 'is', null)
            .lt('stuck_check_since', threshold)
            .is('stuck_notified_at', null);

        if (error) {
            console.error(`[Scheduler] 정체 감시 조회 실패: ${error.message}`);
            return;
        }
        if (!stuckPosts?.length) return;

        const userIds = [...new Set(stuckPosts.map(p => p.user_id))];
        const { data: profileRows } = await supabase
            .from('profiles').select('id, telegram_chat_id').in('id', userIds);
        const chatIdMap = new Map((profileRows || []).map(p => [p.id, p.telegram_chat_id]));

        const telegramBot = require('./telegram_bot');

        for (const post of stuckPosts) {
            try {
                const chatId = chatIdMap.get(post.user_id);
                const keyword = (post.topic || '').split('|||')[0] || '(제목 없음)';

                if (chatId) {
                    await telegramBot.sendMessage(
                        chatId,
                        `⚠️ '${keyword}' 발행이 10분 넘게 진행되지 않고 있습니다. 컴퓨터의 크롬 확장프로그램 연결 상태를 확인해주세요.`
                    );
                } else {
                    console.log(`[Scheduler] 정체 감지(텔레그램 미연동, 알림 스킵): post=${post.id}, user=${post.user_id}`);
                }

                // 텔레그램 발송 성공 여부와 무관하게 항상 마킹 — 미연동 사용자가 매 5분마다
                // 재조회되지 않도록 함 (v1 스코프: 텔레그램 외 알림 채널 없음)
                await supabase.from('posts').update({ stuck_notified_at: new Date().toISOString() }).eq('id', post.id);
            } catch (err) {
                console.error(`[Scheduler] 정체 알림 처리 실패: post=${post.id}, ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`[Scheduler] 정체 감시 완료. ${stuckPosts.length}건 처리.`);
    }
}

module.exports = Scheduler;

// If run directly, start the scheduler
if (require.main === module) {
    const scheduler = new Scheduler();
    scheduler.start();
}
