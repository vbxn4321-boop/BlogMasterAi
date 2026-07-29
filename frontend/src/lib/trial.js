// 구독 전 체험(트라이얼) 플로우에서 공통으로 쓰는 더미 데이터 및 상수 모음.
// 비구독 사용자(profiles.plan_type !== 'pro')에게만 노출되며, 실제 Supabase 데이터를 대체하지 않는다.

// 네이버 계정 탭 / 새 포스팅 탭에서 보여주는 가상 예시 계정.
// id는 실제 UUID가 아닌 고정 문자열 — 절대 Supabase에 저장되지 않고, 저장 시도 시점에 구독 유도 모달로 가로챈다.
export const DEMO_ACCOUNT = {
    id: 'demo-account',
    naver_id: 'demo_blog',
    concept: '맛집',
    is_session_valid: false,
    biz_footer_components: [],
    biz_map_address: null,
    biz_phone: null,
    biz_kakao_id: null,
    biz_kakao_url: null,
    biz_cta_image_url: null,
    biz_footer_text: null,
    biz_image_links: {},
    custom_content_prompt: null,
    custom_image_prompt: null,
    custom_thumbnail_prompt: null,
    custom_formatting_prompt: null,
};

export const isDemoAccount = (accountId) => accountId === DEMO_ACCOUNT.id;

// 대시보드 탭 워드클라우드/추천 키워드용 더미 데이터.
// RecommendationsWidget의 WordCloud가 기대하는 shape과 동일: { keyword, total_volume, competition, saturation }
export const DEMO_KEYWORDS = [
    { keyword: '강남 맛집', total_volume: 49500, competition: '높음', saturation: '높음' },
    { keyword: '합정 카페', total_volume: 22400, competition: '중간', saturation: '중간' },
    { keyword: '홍대 맛집 추천', total_volume: 18100, competition: '높음', saturation: '높음' },
    { keyword: '을지로 맛집', total_volume: 15600, competition: '중간', saturation: '중간' },
    { keyword: '성수동 브런치', total_volume: 12300, competition: '중간', saturation: '낮음' },
    { keyword: '연남동 맛집', total_volume: 11800, competition: '높음', saturation: '중간' },
    { keyword: '한남동 데이트 맛집', total_volume: 9400, competition: '중간', saturation: '낮음' },
    { keyword: '망원동 카페', total_volume: 8700, competition: '낮음', saturation: '낮음' },
    { keyword: '이태원 맛집', total_volume: 7600, competition: '중간', saturation: '중간' },
    { keyword: '건대 술집', total_volume: 6900, competition: '낮음', saturation: '낮음' },
    { keyword: '신촌 분식집', total_volume: 5200, competition: '낮음', saturation: '낮음' },
    { keyword: '용산 맛집 리스트', total_volume: 4100, competition: '낮음', saturation: '낮음' },
];

// 새 포스팅 탭 "원고 생성"의 더미 결과. previews 배열 항목과 동일한 shape을 맞춰
// 기존 미리보기 렌더링 로직을 수정 없이 그대로 재사용한다.
export const DEMO_DRAFT = {
    title: '강남 맛집 추천, 이 골목 하나면 실패 없어요',
    body: `요즘 강남에서 밥 약속 잡을 때마다 어디로 가야 할지 고민되시죠?

오늘은 제가 직접 다녀온 강남 맛집을 소개해드리려고 해요. 회사 동료들과 몇 번을 가도 질리지 않는 곳이라 믿고 추천드립니다.

[QUOTE_VERTICAL]웨이팅이 있어도 한 번쯤은 꼭 가봐야 하는 곳이에요.[/QUOTE_VERTICAL]

먼저 이 집의 시그니처 메뉴부터 살펴볼게요. 재료 본연의 맛을 살리면서도 자극적이지 않아 남녀노소 누구나 좋아할 만한 맛이었습니다. 특히 점심시간에는 회전율이 빨라서 생각보다 오래 기다리지 않아도 되더라고요.

가격대도 강남치고는 합리적인 편이라 부담 없이 방문하기 좋았어요. 주차 공간도 넉넉해서 차를 가지고 가셔도 크게 불편함이 없었습니다.

다음에 강남에서 약속이 있으시다면 이 곳을 한번 들러보시는 걸 추천드려요. 분명 만족스러운 한 끼가 될 거예요.

(이 원고는 구독 전 체험을 위한 예시 원고입니다. 실제 발행은 구독 후 이용하실 수 있어요.)`,
    hashtags: ['#강남맛집', '#강남맛집추천', '#강남데이트', '#강남맛집리스트', '#서울맛집'],
    image_prompts: [],
    thumbnail_text: null,
    seo_stats: null,
    data_asset: { target_keywords: { main: '강남 맛집' } },
};

export const KEYWORD_SEARCH_TRIAL_LIMIT = 3;
export const KEYWORD_SEARCH_FEATURE = 'keyword_search';

export const SUBSCRIPTION_MODAL_MESSAGE = '구독 후 이용 가능한 기능입니다. 설정 및 구독 탭에서 구독해 주세요.';
