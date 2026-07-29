// 텔레그램 "발행설정" 대화형 위저드에서 쓰는 상수/키보드 빌더/설정 복원 로직.
// ⚠️ frontend/src/components/telegram/TelegramScheduleForm.js의 동일 배열과 반드시 동기화 유지
// (백엔드/프론트엔드가 별도 배포체라 공유 import가 불가능 — 값이 바뀌면 양쪽 다 고칠 것)
const TELEGRAM_TONE_OPTIONS = ['친근한 존댓말', '여성적인 말투', '남성적인 말투', '일상체', '건강·의학'];
const TELEGRAM_CATEGORY_OPTIONS = ['여행', '일상', '맛집', '리뷰', '건강', '재테크', 'IT', '육아', '반려동물'];

// ⚠️ frontend/src/app/dashboard/post/page.js의 TOPIC_GROUPS(약 351번째 줄)와 동기화 유지
const TELEGRAM_TOPIC_GROUPS = [
    { name: '엔터테인먼트·예술', topics: ['문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송'] },
    { name: '생활·노하우·쇼핑', topics: ['일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배'] },
    { name: '취미·여가·여행', topics: ['게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집'] },
    { name: '지식·동향', topics: ['IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문'] },
];

// ⚠️ frontend/src/app/dashboard/post/page.js의 visibility 매핑표(약 2237번째 줄)와 동기화 유지
const TELEGRAM_VISIBILITY_OPTIONS = [
    { value: 'all', label: '전체공개' },
    { value: 'neighbor', label: '이웃공개' },
    { value: 'buddy', label: '서로이웃공개' },
    { value: 'private', label: '비공개' },
];
const TELEGRAM_VISIBILITY_PERMISSIONS = {
    all: { allow_comments: true, allow_likes: true, allow_search: true, allow_share: true, allow_external: true },
    neighbor: { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
    buddy: { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
    private: { allow_comments: true, allow_likes: false, allow_search: false, allow_share: false, allow_external: false },
};

function buildToneRows() {
    return TELEGRAM_TONE_OPTIONS.map((t, i) => [{ text: t, callback_data: `wz:tone:${i}` }]);
}

function buildCategoryRows() {
    const buttons = TELEGRAM_CATEGORY_OPTIONS.map((c, i) => ({ text: c, callback_data: `wz:cat:${i}` }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
    return rows;
}

function buildPresetRows(presets) {
    const rows = presets.map(p => [{
        text: p.content.length > 24 ? p.content.slice(0, 24) + '…' : p.content,
        callback_data: `wz:preset:${p.id}`,
    }]);
    rows.push([{ text: '직접 입력', callback_data: 'wz:preset:custom' }]);
    return rows;
}

/**
 * categories: [{id, name, isSub}, ...] — GET /api/accounts/:id/categories 응답을 그대로 받는다.
 * 계정마다 개수가 다르고 실제 값(긴 id 등)이 콜백 데이터 바이트 제한에 걸릴 수 있어서, 버튼에는
 * 배열 인덱스만 싣고 실제 값은 호출부가 telegram_conversations.wizard_cache에 들고 있는다.
 */
function buildNaverCategoryRows(categories) {
    const rows = categories.map((c, i) => [{
        text: c.isSub ? `　${c.name}` : c.name,
        callback_data: `wz:navcat:${i}`,
    }]);
    rows.push([{ text: '건너뛰기', callback_data: 'wz:navcat:skip' }]);
    return rows;
}

function buildTopicGroupRows() {
    const rows = TELEGRAM_TOPIC_GROUPS.map((g, i) => [{ text: g.name, callback_data: `wz:topicgrp:${i}` }]);
    rows.push([{ text: '건너뛰기', callback_data: 'wz:topicgrp:skip' }]);
    return rows;
}

function buildTopicRows(groupIdx) {
    const topics = TELEGRAM_TOPIC_GROUPS[groupIdx]?.topics || [];
    const buttons = topics.map((t, i) => ({ text: t, callback_data: `wz:topic:${i}` }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
    return rows;
}

function buildVisibilityRows() {
    const buttons = TELEGRAM_VISIBILITY_OPTIONS.map((v, i) => ({ text: v.label, callback_data: `wz:vis:${i}` }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    return rows;
}

const SCHEDULE_MIN_LEAD_MINUTES = 30;
const SCHEDULE_ROUND_MINUTES = 10;

/**
 * "YYYY-MM-DD HH:MM" 형식(KST 기준)을 파싱해서 UTC Date로 변환한다. 형식이 안 맞으면
 * { valid:false }를 반환하고(재입력 요청), 형식은 맞지만 리드타임(30분)보다 이르면 하드 거부
 * 대신 가장 가까운 유효 시각(10분 단위 반올림)으로 자동 보정하고 adjusted:true를 표시한다
 * (옛 Puppeteer 경로에만 있던 리드타임/반올림 검증을 prepareForExtension 경로에도 동일하게 적용).
 */
function parseScheduleDatetimeKST(text) {
    const m = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return { valid: false };
    const [, yy, mo, d, h, mi] = m;
    const y = Number(yy), month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return { valid: false };

    const utcMs = Date.UTC(y, month - 1, day, hour - 9, minute); // KST → UTC
    let date = new Date(utcMs);
    if (isNaN(date.getTime())) return { valid: false };

    let adjusted = false;
    const minValid = new Date(Date.now() + SCHEDULE_MIN_LEAD_MINUTES * 60000);
    if (date < minValid) { date = minValid; adjusted = true; }

    const stepMs = SCHEDULE_ROUND_MINUTES * 60000;
    const rounded = new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
    if (rounded.getTime() !== date.getTime()) adjusted = true;

    return { valid: true, date: rounded, adjusted };
}

function formatKST(date) {
    const kst = new Date(date.getTime() + 9 * 3600 * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/**
 * 즉시발행 시 쓸 설정을 결정한다. 해당 네이버 계정의 가장 최근 성공 발행 글이 있으면 그때
 * 쓰였던 말투/세부요청사항/이미지방식/카테고리를 그대로 재사용하고, 없으면 관리자가
 * telegram_schedule_settings에 저장해둔 기본값으로 폴백한다.
 * posts.topic은 어떤 경로로 만들어졌든 "<키워드>|||{JSON}" 형태라 기존 prepareForExtension()의
 * 파싱 방식(topic.split('|||') → JSON.parse, try/catch로 방어)을 그대로 재사용한다.
 */
async function resolveLastSuccessSettings(supabase, naverAccountId, userId) {
    const { data: last } = await supabase
        .from('posts')
        .select('topic, category, content_json')
        .eq('naver_account_id', naverAccountId)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (last) {
        let parsed = {};
        try { parsed = JSON.parse((last.topic || '').split('|||')[1] || '{}'); } catch (_) {}
        return {
            tone: parsed.seo_category || TELEGRAM_TONE_OPTIONS[0],
            customInstructions: parsed.custom_instructions || '',
            imageSource: last.content_json?.image_source || parsed.image_source || 'gemini',
            category: last.category || TELEGRAM_CATEGORY_OPTIONS[1],
        };
    }

    const { data: settings } = await supabase
        .from('telegram_schedule_settings')
        .select('default_tone, default_category, default_custom_instructions, default_image_source')
        .eq('user_id', userId)
        .maybeSingle();

    return {
        tone: settings?.default_tone || TELEGRAM_TONE_OPTIONS[0],
        customInstructions: settings?.default_custom_instructions || '',
        imageSource: settings?.default_image_source || 'gemini',
        category: settings?.default_category || TELEGRAM_CATEGORY_OPTIONS[1],
    };
}

/**
 * 발행설정 위저드의 "네이버 블로그 카테고리" 질문 직전에 쓴다. 해당 네이버 계정의 가장 최근
 * 성공 발행 글에 publish_options(네이버카테고리/글주제/공개설정/지도)가 있으면 그 값을 그대로
 * 반환하고, 이전 발행이 아예 없거나 있어도 publish_options가 없는 옛날 글이면 null을 반환한다
 * (null이면 호출부가 이 확인 단계를 건너뛰고 바로 하나씩 물어보는 기존 흐름으로 넘어감).
 */
async function resolveLastPublishOptions(supabase, naverAccountId) {
    const { data: last } = await supabase
        .from('posts')
        .select('topic')
        .eq('naver_account_id', naverAccountId)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!last) return null;

    let parsed = {};
    try { parsed = JSON.parse((last.topic || '').split('|||')[1] || '{}'); } catch (_) {}
    const po = parsed.publish_options;
    if (!po) return null;

    return {
        naver_category_id: po.category_id || '',
        naver_category_name: po.category_name || '',
        topic_id: po.topic_id || '0',
        visibility: po.visibility || 'all',
        allow_comments: po.allow_comments,
        allow_likes: po.allow_likes,
        allow_search: po.allow_search,
        allow_share: po.allow_share,
        allow_external: po.allow_external,
        use_map: !!po.use_map,
        map_address: po.map_address || '',
    };
}

module.exports = {
    TELEGRAM_TONE_OPTIONS,
    TELEGRAM_CATEGORY_OPTIONS,
    TELEGRAM_TOPIC_GROUPS,
    TELEGRAM_VISIBILITY_OPTIONS,
    TELEGRAM_VISIBILITY_PERMISSIONS,
    buildToneRows,
    buildCategoryRows,
    buildPresetRows,
    buildNaverCategoryRows,
    buildTopicGroupRows,
    buildTopicRows,
    buildVisibilityRows,
    parseScheduleDatetimeKST,
    formatKST,
    resolveLastSuccessSettings,
    resolveLastPublishOptions,
};
