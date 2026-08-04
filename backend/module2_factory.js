const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Module 2: Content Factory (Expert Content Generator)
 */
class ContentFactory {
    constructor(apiKey) {
        if (!apiKey && !config.useDummyContent) throw new Error("API Key가 설정되지 않았습니다.");
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey.trim());
        }
        this.modelName = config.geminiModel || "gemini-2.5-flash";
    }

    async generate(dataAsset, accountPrompts = {}, triggerType = 'manual') {
        if (config.useDummyContent) {
            console.log(`[ContentFactory] 🤖 Dummy Mode Active - Returning mock content`);
            const title = `[DUMMY] ${dataAsset.target_keywords.main} 관련 최고의 정보`;
            const content = `
[QUOTE_VERTICAL]${dataAsset.target_keywords.main}에 대한 모든 것[/QUOTE_VERTICAL]
[IMAGE_ANCHOR_1]
안녕하세요! 오늘은 많은 분들이 궁금해하시는 [B]${dataAsset.target_keywords.main}[/B]에 대해 자세히 알아보는 시간을 가져보겠습니다. 

이 정보는 제미나이 API를 사용하지 않고 생성된 **더미 데이터**입니다. 실제 블로그 자동화 시스템의 레이아웃과 기능을 테스트하기 위해 만들어졌습니다.

[QUOTE_VERTICAL]주요 특징 및 혜택[/QUOTE_VERTICAL]
[IMAGE_ANCHOR_2]
이번에 소개해드리는 내용은 다음과 같은 장점이 있습니다:
- [B]비용 절감[/B]: API 호출 없이 시스템 테스트 가능
- [B]빠른 속도[/B]: AI 생성 대기 시간 없이 즉시 결과 도출
- [B]레이아웃 확인[/B]: 이미지 앵커와 풋터가 정상적으로 삽입되는지 확인

[IMAGE_ANCHOR_3]
중요한 포인트는 [B]가성비와 접근성[/B]입니다. 영종도 근처나 인천공항을 이용하시는 분들께 아주 유용한 정보가 될 것입니다.

[QUOTE_VERTICAL]이용 팁과 주의사항[/QUOTE_VERTICAL]
[IMAGE_ANCHOR_4]
더미 모드에서는 실제 키워드 분석 결과가 아닌 미리 정의된 템플릿이 출력됩니다. 이를 통해 검색 결과에 어떻게 반영되는지, 배치는 적절한지 미리 파악해 볼 수 있습니다.

[IMAGE_ANCHOR_5]


[BUSINESS_MAP_BLOCK]
[BUSINESS_CTA_BANNER]
            `.trim();

            return {
                title,
                content,
                image_prompts: [
                    "감성적인 여행 풍경 사진",
                    "편안한 호텔 로비의 분위기",
                    "정갈하고 맛있는 호텔 조식",
                    "깔끔하고 현대적인 객실 내부",
                    "창밖으로 보이는 멋진 야경",
                    "여행을 떠나는 설레는 발걸음",
                    "친절한 직원의 서비스 모습",
                    "안락한 휴식을 취하는 여행객"
                ],
                hashtags: ["#더미테스트", "#블로그자동화", "#비용절감", "#테스트포스팅"],
                seo_guidelines: { main_keyword: dataAsset.target_keywords.main }
            };
        }

        const imageSource = (accountPrompts || {}).image_source || 'gemini';

        // Core personas and instructions
        let userContentPrompt = accountPrompts.content_prompt || "";

        // 이미지 참조 모드인 경우 전용 프롬프트 사용 (v2 우선, 없으면 v1, 둘 다 없으면 기본 원고 프롬프트)
        if (triggerType === 'image_reference') {
            userContentPrompt = accountPrompts.custom_image_reference_v2_prompt || accountPrompts.image_reference_prompt || accountPrompts.content_prompt || "";
        }
        const userFormattingPrompt = accountPrompts.formatting_prompt || "";
        const customGuide = accountPrompts.custom_instructions || dataAsset.custom_instructions || "";

        const systemPersona = "당신은 네이버블로그 전문 콘텐츠 작가입니다.";

        // 말투 / SEO 카테고리 프롬프트 파일 로드
        const promptsDir = path.join(__dirname, 'prompts');
        const categoryFileMap = {
            // 말투 기반
            '친근한 존댓말': 'tone_친근한존댓말.md',
            '여성적인 말투': 'tone_여성적말투.md',
            '남성적인 말투': 'tone_남성적말투.md',
            '일상체': 'tone_일상체.md',
            // 전문 카테고리 (건강·의학만 별도 유지)
            '건강·의학': 'category_건강의학.md',
        };

        const selectedCategory = accountPrompts.seo_category || '친근한 존댓말';
        // '나의 프롬프트' 선택 시에는 미리 정의된 톤 파일을 전혀 로드하지 않는다 — 그래야
        // 아래 [BASE INSTRUCTIONS]의 userContentPrompt(계정별 custom_content_prompt)가
        // "우선 적용" 톤 파일에 밀리지 않고 유일한 말투 지침으로 작동한다.
        // [FORMATTING RULES]/[REQUIRED STRUCTURE & TAGS]의 필수 제약은 이 선택과 무관하게 항상 그대로 유지된다.
        const isCustomPromptMode = selectedCategory === '나의 프롬프트';

        const loadPromptFile = (filename) => {
            try {
                return fs.readFileSync(path.join(promptsDir, filename), 'utf8').trim();
            } catch (e) {
                console.warn(`[ContentFactory] 프롬프트 파일 없음: ${filename}`);
                return '';
            }
        };

        const categoryPrompt = isCustomPromptMode ? '' : loadPromptFile(categoryFileMap[selectedCategory] || categoryFileMap['친근한 존댓말']);
        console.log(`[ContentFactory] 글 말투: ${selectedCategory}${isCustomPromptMode ? ' (계정 커스텀 프롬프트 사용)' : ''}`);

        // 풋터: 사용자가 등록한 footer_components/footer_text는 발행 시 구조화된 푸터 시스템이
        // 정확한 위치에 직접 삽입하므로, 본문에는 절대 끼워넣지 않는다 (중복 방지).
        // AI 본문 마무리에는 말투별 기본 인사만 사용.
        const footerClosingByTone = {
            '친근한 존댓말': '궁금하신 점이 있으시면 언제든지 편하게 문의해 주세요 😊',
            '여성적인 말투': '궁금하신 게 있으시면 언제든지 편하게 물어봐 주세요 💕',
            '남성적인 말투': '문의는 아래로 하면 된다.',
            '일상체': '궁금한 거 있으면 편하게 문의하면 됨 😊',
            '건강·의학': '건강한 생활을 응원합니다 😊',
        };
        const footerText = footerClosingByTone[selectedCategory] || footerClosingByTone['친근한 존댓말'];

        const imageCount = (triggerType === 'image_reference' && dataAsset.image_paths) ? Math.max(1, dataAsset.image_paths.length) : 8;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const prompt = `
[CURRENT DATE]
오늘 날짜: ${currentYear}년 ${currentMonth}월. 글에 연도를 언급할 때는 반드시 ${currentYear}년을 기준으로 작성하세요. 과거 연도(2024년 등)를 현재인 것처럼 쓰지 마세요.

${categoryPrompt ? `[글 말투 지침 — 전체 원고의 어투·스타일은 반드시 이 섹션의 규칙을 따를 것. BASE INSTRUCTIONS에 다른 톤·스타일 지침이 있더라도 이 섹션이 우선 적용됨]\n${categoryPrompt}\n` : ''}

[BASE INSTRUCTIONS]
${userContentPrompt || systemPersona}

${triggerType === 'image_reference' ? `
[SPECIAL INSTRUCTION: IMAGE REFERENCE MODE]
당신에게는 사용자가 제공한 이미지들과 각 이미지에 대한 설명이 주어졌습니다.
1. 제공된 이미지 분석 내용과 사용자의 상세 설명을 원고에 적극적으로 반영하세요.
2. 마치 직접 현장에서 경험한 것처럼 생생하고 구체적으로 묘사하세요. (예: "사진에서 보이는 것처럼 ~", "이미지 속의 ~가 참 인상적이었는데요.")
3. 이미지의 시각적 디테일(색감, 분위기, 장소의 특징 등)을 문장으로 풀어내어 현장감을 부여하세요.
4. AI 라는 단어는 사용하지 마세요.
` : ''}

[FORMATTING RULES]
${userFormattingPrompt || '본문 중간중간 중요 정보에 [B] 태그를 사용하여 과감하게 강조하세요.'}
- **맞춤법·띄어쓰기 절대 준수**: 모든 문장은 표준 한국어 맞춤법과 띄어쓰기를 완벽하게 지켜 작성하세요. 오타, 붙여쓰기 오류, 조사 오류가 단 하나도 없어야 합니다. 출력 전 스스로 검토하세요.
- **AI 관련 표현 절대 금지 (제목 포함)**: 제목과 본문 전체에서 'AI', '인공지능', 'AI 추천', 'AI 작성', '챗봇', '생성 AI', 'AI가 작성', 'AI와', 'AI로' 등 AI·자동화 관련 단어를 절대 사용하지 마세요. ###[SEO_TITLE]에는 특히 'AI'라는 두 글자가 단 한 번도 등장해선 안 됩니다. 마치 블로거가 직접 작성한 글처럼 자연스럽게 쓰세요.
- **제목 년도 금지**: ###[SEO_TITLE] 제목에 '2026년', '2025년', '2026', '2025', '2024' 등 연도(숫자 4자리 또는 '년' 포함)를 절대 포함하지 마세요. 본문에는 사용 가능하나 제목에는 넣지 마세요.
- **NO MARKDOWN**: 오직 \`[B]텍스트[/B]\`와 \`[QUOTE_...]\` 태그만 사용하세요. (\*\*, \\_\\_, \` 등 사용 금지)
- **목록 작성 시 마크다운 불릿 절대 금지**: 항목을 나열할 때 줄 앞에 \`*\`, \`-\`, \`•\` 같은 불릿 기호를 붙이지 마세요. 네이버 에디터는 이 기호를 목록으로 변환하지 못하고 글자 그대로 노출시킵니다. 대신 [B] 태그로 항목명을 강조한 뒤 자연스러운 문장으로 이어서 설명하거나, 각 항목을 [QUOTE_VERTICAL] 소제목으로 분리하세요.
  - **잘못된 예 (절대 금지)**: \`*   [B]괌, 하와이:[/B] 짧은 비행시간...\`
  - **올바른 예**: \`[B]괌, 하와이[/B]는 짧은 비행시간과 아름다운 자연경관으로...\` (문장형으로 자연스럽게 서술)
- **볼드([B]) 사용 규칙 (초강력 준수)**:
  - **핵심 키워드 및 서브 키워드 단어에는 절대로 [B] 볼드를 사용하지 마세요.** (예: '[B]보라카이 패키지여행[/B]' 금지)
  - 오직 문맥상 강조해야 할 핵심 정보, 혜택, 조건, 팁(1~3단어 이내)에만 선택적으로 [B]를 적용하세요. (예: [B]무료 주차[/B], [B]50% 할인[/B], [B]오후 2시 마감[/B])
- **인용구 태그([QUOTE_POSTIT], [QUOTE_DEFAULT], [QUOTE_BALLOON], [QUOTE_VERTICAL]) 사용 규칙**:
  - 원고 생성 중 강조하고 싶은 핵심 요약이나 꿀팁은 포스트잇(`[QUOTE_POSTIT]`), 기본 따옴표(`[QUOTE_DEFAULT]`), 말풍선(`[QUOTE_BALLOON]`), 세로선(`[QUOTE_VERTICAL]`) 태그를 적극 활용하세요.
  - **인용구 내용 길이 제한 (절대 준수)**: 인용구 안의 내용물은 절대 길면 안 되며, **강조할 만한 '단 한 문장'(최대 30자~40자 이내의 임팩트 있는 핵심 문장 1개)**만 넣으세요. 긴 문단이나 여러 줄 서술을 인용구에 넣는 것은 엄격히 금지됩니다.
  - 올바른 예: `[QUOTE_POSTIT]오전 10시 이전 방문 시 대기 없이 바로 입장할 수 있습니다.[/QUOTE_POSTIT]`
- **표(Table) 생성 허용**:
  - 요금표, 스펙 비교, 옵션 정리, 장단점 비교 등 데이터 정리가 유용한 경우 Markdown 표(`| 헤더1 | 헤더2 | ...`) 형식을 자연스럽게 생성하여 정보성을 높이세요.
- **태그 자가 검토 (출력 전 필수)**: 원고 작성 완료 후, 본문에 사용된 모든 태그를 처음부터 끝까지 한 번 더 확인하세요. 허용된 태그는 `[B][/B]`, `[QUOTE_...][/QUOTE_...]`, `[IMAGE_ANCHOR_숫자]`, `[BUSINESS_MAP_BLOCK]`, `[BUSINESS_CTA_BANNER]` 5종뿐입니다. 오타가 있는 태그(예: [/<B], [/B ], [QUOTE_VERTICALL] 등)만 정확한 형식으로 수정하고, 본문 내용은 절대 변경하지 마세요.

[REQUIRED STRUCTURE & TAGS]
다음은 시스템 파싱을 위해 **반드시** 지켜야 할 기술적 규칙입니다. 위 지침보다 이 규칙이 우선합니다:

1. **Information Accuracy (초강력 준수)**:
   - 아래 [INPUT DATA]의 **'추출 정보' 및 '원본 분석 내용'**을 최우선으로 참고하여 글을 쓰세요.
   - 제공된 URL이나 이미지 분석 결과에서 파악된 스케줄, 가격, 포함사항 등을 누락 없이 본문에 녹여내세요.

2. **Headers**: 반드시 아래 5가지 ### 헤더를 사용하여 답변을 구분하세요.
   - ###[SEO_TITLE]
   - ###[POST_CONTENT]
   - ###[HASHTAGS]
   - ###[IMAGE_PROMPTS_LIST]
   - ###[SEO_GUIDELINES]

2-1. **IMAGE_PROMPTS_LIST 작성 규칙 (절대 준수)**:
${accountPrompts.image_prompt ? `   - **사용자 지정 이미지 스타일 가이드 (아래 내용을 이미지 프롬프트의 분위기·스타일에 반영하되, 이 섹션의 다른 절대 규칙(언어/형식)은 그대로 지킬 것)**: ${accountPrompts.image_prompt}\n` : ''}${imageSource === 'stock' ? `
   - 이미지 프롬프트는 반드시 **영어(English)**로만 작성하세요. 한글 사용 절대 금지.
   - **Pexels 사진 검색 최적화 모드**: 반드시 **쉼표(,)로 구분된 1~2단어 키워드 2~3개** 형식으로만 작성하세요.
   - 형식: "키워드1, 키워드2" 또는 "키워드1, 키워드2, 키워드3"
   - 문장, 조사, 전치사(a/the/with/in/of 등), 형용사 수식어, 묘사 표현은 절대 사용하지 마세요.
   - 사람이 등장하는 이미지는 반드시 **Korean** 키워드를 포함하세요.
   - **올바른 예시**: "Korean woman, travel planning", "street food, Seoul market", "mountain trail, Korea", "Korean family, vacation", "couple, travel discussion"
   - **잘못된 예시**: "A Korean woman planning her travel" / "Beautiful street food market in Seoul" (문장 형태 절대 금지)
` : `
   - 이미지 프롬프트는 반드시 **영어(English)**로만 작성하세요. 한글 사용 절대 금지.
   - 이미지에 사람이 등장하는 경우, 반드시 **Korean people** 또는 **Korean person**으로 명시하세요. (예: "A Korean woman smiling...", "A group of Korean tourists...")
`}

3. **Image Anchors**:
   - **[IMAGE_ANCHOR_1]부터 [IMAGE_ANCHOR_${imageCount}]까지 ${imageCount}개 전부를 빠짐없이 사용하세요. 단 하나라도 누락되면 안 됩니다.**
   - ${imageCount}개 모두 반드시 풋터(연락처 문의 문단/[BUSINESS_MAP_BLOCK]/[BUSINESS_CTA_BANNER]) 이전 본문 안에 배치하세요. 풋터 이후 배치는 절대 금지입니다.
   - 섹션이 부족하여 앵커를 다 넣기 어렵다면 단락과 단락 사이에 추가로 배치하여 ${imageCount}개를 반드시 모두 채우세요.
   - **출력 전 [IMAGE_ANCHOR_1]~[IMAGE_ANCHOR_${imageCount}]가 전부 존재하는지 직접 확인하세요.**

4. **Layout Logic**:
   [QUOTE_VERTICAL]소제목[/QUOTE_VERTICAL]
   [IMAGE_ANCHOR_X]
   본문 내용 (중요 정보에 [B] 적극 활용)

5. **Inquiry Section & Business Modules (절대 생략 금지)**:
${footerText ? `   - 본문의 마무리(해시태그 직전)에는 반드시 아래 풋터 내용을 포함하세요.
   - 단, '<풋터 내용 시작>' 이나 '<풋터 내용 끝>' 같은 안내성 문구(마커)는 **절대로 본문에 출력하지 마세요.** 실제 내용만 자연스럽게 작성하세요.

<풋터 내용 시작>
${footerText}
<풋터 내용 끝>

   - 위 풋터 뒤에 [BUSINESS_MAP_BLOCK]과 [BUSINESS_CTA_BANNER]를 한 줄씩 삽입하세요.
   - **절대 규칙**: 어떤 이유로도 위 풋터를 생략하거나 내용을 임의로 바꾸어 쓰지 마세요.` : `   - 본문 마무리 후 [BUSINESS_MAP_BLOCK]과 [BUSINESS_CTA_BANNER]를 한 줄씩 삽입하세요.`}

6. **SEO Guidelines**: ###[SEO_GUIDELINES] 섹션의 내용은 시스템 참고용이며 **절대 본문에 포함하지 마세요.**
7. **Custom Request**: ${customGuide || 'N/A'}

8. **Keyword Placement Rules (절대 준수)**:
   - **핵심 키워드(${dataAsset.target_keywords.main})는 반드시 ###[SEO_TITLE] 제목 안에 그대로 포함되어야 합니다.** 제목에서 핵심 키워드가 누락되는 것은 절대 금지입니다.
   - **핵심 키워드(${dataAsset.target_keywords.main})는 본문에도 최소 4~5회 자연스럽게 포함되어야 하며, 소제목([QUOTE_VERTICAL] 태그) 중 최소 1개 이상에도 포함되어야 합니다.** 제목에만 넣고 본문·소제목에서는 빠뜨리는 것은 절대 금지입니다.
   - **서브 키워드(${dataAsset.target_keywords.sub.join(', ')})는 전체 소제목([QUOTE_VERTICAL] 태그) 개수의 약 절반 정도에 자연스럽게 포함되어야 합니다.** (예: 소제목이 4개면 그중 2개, 5개면 2~3개의 소제목에 서브 키워드가 들어가야 합니다.)
   - 모든 소제목에 억지로 키워드를 끼워 넣지 말고, 나머지 소제목은 키워드 없이 자연스러운 주제로 작성하세요.
   - 출력 전, 다음을 모두 스스로 확인하세요: ① 제목에 핵심 키워드가 포함되어 있는가, ② 본문에 핵심 키워드가 4~5회 등장하는가, ③ 소제목 중 최소 1개 이상에 핵심 키워드가 포함되어 있는가, ④ 소제목 중 절반 정도에 서브 키워드가 들어가 있는가.

[INPUT DATA]
- 키워드: ${dataAsset.target_keywords.main} (서브: ${dataAsset.target_keywords.sub.join(', ')})
- 추출 정보 (URL/이미지 분석): ${JSON.stringify(dataAsset.extracted_data)}
- 원본 분석 상세 내용 (이미지 기반인 경우 이미지 설명 포함): ${dataAsset.analysis_report || 'N/A'}
`;


        const FALLBACK_MODELS = ['gemini-2.5-flash-lite'];
        const parseWaitSec = (errMsg) => {
            const m = errMsg.match(/"retryDelay"\s*:\s*"(\d+)/) || errMsg.match(/retry in (\d+)/i);
            return m ? parseInt(m[1]) + 3 : 62;
        };
        const GEMINI_TIMEOUT_MS = 120000; // 2분 타임아웃
        const withTimeout = (promise, ms) => Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini API timeout after ${ms / 1000}s`)), ms))
        ]);

        const generateWithRetry = async (modelName) => {
            const modelList = [modelName, ...FALLBACK_MODELS.filter(m => m !== modelName)];
            // 1단계: 폴백 모델 순서대로 즉시 시도
            for (const name of modelList) {
                try {
                    const model = this.genAI.getGenerativeModel({ model: name });
                    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
                    const text = result.response.text();
                    console.log(`[ContentFactory] Generated length: ${text.length} (model: ${name})`);
                    return text;
                } catch (e) {
                    const is429 = e.message && (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('RESOURCE_EXHAUSTED'));
                    if (!is429) { console.error(`[ContentFactory] ${name} failed: ${e.message}`); throw e; }
                    console.warn(`[ContentFactory] 429 (${name}) — 다음 모델 시도...`);
                }
            }
            // 2단계: 모든 폴백 소진 → retryDelay 대기 후 마지막 모델로 재시도
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const model = this.genAI.getGenerativeModel({ model: FALLBACK_MODELS[FALLBACK_MODELS.length - 1] });
                    const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
                    return result.response.text();
                } catch (e) {
                    const is429 = e.message && (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('RESOURCE_EXHAUSTED'));
                    if (!is429 || attempt === 1) { console.error(`[ContentFactory] 최종 실패: ${e.message}`); throw e; }
                    const waitSec = parseWaitSec(e.message);
                    console.warn(`[ContentFactory] 429 모든 모델 소진 — ${waitSec}초 대기 후 재시도...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                }
            }
        };

        const text = await generateWithRetry(this.modelName);
        const result = this.parseOutput(text, dataAsset, triggerType);

        // 썸네일 텍스트 설정 — image_prompts[0]을 영어 썸네일 전용 프롬프트로 교체
        const thumbnailConfig = accountPrompts?.thumbnail_text_config;
        if (thumbnailConfig?.enabled) {
            result.thumbnail_text = thumbnailConfig.type === 'custom' && thumbnailConfig.custom_text
                ? thumbnailConfig.custom_text
                : result.title;
            result.thumbnail_sub_text = thumbnailConfig.sub_text || null;
            result.thumbnail_style = thumbnailConfig.style || 'center_text';
            result.thumbnail_text_color = thumbnailConfig.text_color || 'white';
            result.thumbnail_bg_type = thumbnailConfig.bg_type || 'image';
            result.thumbnail_bg_color = thumbnailConfig.bg_color || null;

            // image_prompts[0]을 썸네일 전용 프롬프트로 교체
            const titleText = result.thumbnail_text;
            const subText = result.thumbnail_sub_text;
            const layoutDesc = {
                'center_text':
                    'CRITICAL LAYOUT — CENTER TEXT STYLE: ' +
                    'The ENTIRE text block (title + subtitle combined) must be centered at exactly the 50% horizontal and 50% vertical midpoint of the image. ' +
                    'Imagine a horizontal line at 50% height — the text block must be equally split above and below that line. ' +
                    'Imagine a vertical line at 50% width — the text block must be equally split left and right of that line. ' +
                    'FORBIDDEN ZONES: The top 30% of the image must contain NO text. The bottom 30% of the image must contain NO text. ' +
                    'The text has NO border box or frame around it. ' +
                    'Subtitle is placed directly below the title with a small gap. ' +
                    'Do NOT drift the text toward the bottom, top, or any corner under any circumstances.',

                'bottom_left':
                    'CRITICAL LAYOUT — BOTTOM LEFT STYLE: ' +
                    'The ENTIRE text block (title + subtitle combined) must be placed strictly within the BOTTOM 25% of the image, aligned to the LEFT edge with a small margin. ' +
                    'Text must be LEFT-ALIGNED. ' +
                    'FORBIDDEN ZONE: The top 75% of the image must contain absolutely NO text — only the background is visible there. ' +
                    'Apply very strong black drop shadow on all text for readability. ' +
                    'Do NOT place any text in the center, top, or right side of the image.',

                'center_box':
                    'CRITICAL LAYOUT — CENTER BOX STYLE: ' +
                    'The ENTIRE text block (title + subtitle combined) plus its surrounding white border box must be centered at exactly the 50% horizontal and 50% vertical midpoint of the image. ' +
                    'Imagine a horizontal line at 50% height — the box must be equally split above and below that line. ' +
                    'FORBIDDEN ZONES: The top 30% and bottom 30% of the image must contain NO text and NO box. ' +
                    'Draw a thin white rectangular border/outline box that tightly surrounds the text area with equal padding on all sides. ' +
                    'Do NOT place the box or text anywhere other than the exact center of the image.',

                'bottom_right':
                    'CRITICAL LAYOUT — BOTTOM RIGHT STYLE: ' +
                    'The ENTIRE text block (title + subtitle combined) must be placed strictly within the BOTTOM 25% of the image, aligned to the RIGHT edge with a small margin. ' +
                    'Text must be RIGHT-ALIGNED. ' +
                    'FORBIDDEN ZONE: The top 75% of the image must contain absolutely NO text — only the background is visible there. ' +
                    'Apply very strong black drop shadow on all text for readability. ' +
                    'Do NOT place any text in the center, top, or left side of the image.'
            };
            const layout = layoutDesc[thumbnailConfig.style] || layoutDesc['center_text'];
            const originalPrompt = result.image_prompts[0] || '';
            const bgDesc = thumbnailConfig.bg_type === 'color' && thumbnailConfig.bg_color
                ? `solid flat color background exactly ${thumbnailConfig.bg_color}, no photos, no patterns`
                : originalPrompt;

            // 블랙 투명도
            const blackOverlay = thumbnailConfig.black_overlay || 0;
            const overlayDesc = blackOverlay > 0
                ? `MANDATORY BACKGROUND TREATMENT: A uniform semi-transparent black overlay at exactly ${blackOverlay}% opacity must cover 100% of the entire image from edge to edge. Every single pixel of the background must be equally darkened by this overlay. This is NOT a vignette, NOT a gradient, NOT limited to the text area — it is a complete full-image uniform darkening applied before any text is placed. `
                : '';

            // 글꼴
            const fontMap = {
                'bold_gothic': 'Heavy Bold Gothic Sans-Serif Korean font (similar to Black Han Sans or Noto Sans KR Black weight)',
                'elegant_serif': 'Elegant Thin Serif Korean font (similar to Nanum Myeongjo or classic Myeongjo style)',
                'rounded_sans': 'Rounded Friendly Sans-Serif Korean font (similar to Gmarket Sans or rounded Gothic)',
                'handwritten': 'Casual Handwritten Korean font (similar to Nanum Pen Script or brush handwriting style)'
            };
            const fontDesc = fontMap[thumbnailConfig.font] || fontMap['bold_gothic'];

            result.image_prompts[0] = `Professional Korean blog thumbnail image, 1:1 square format. `
                + `IMPORTANT: The background must fill the ENTIRE image — do NOT split the image or create separate sections for text and photo. `
                + `Background: ${bgDesc}. `
                + overlayDesc
                + `${layout}. `
                + `Title text: "${titleText}" — very large, white Korean text with strong black stroke for readability. Font style: ${fontDesc}. `
                + (subText ? `Subtitle: "${subText}" — smaller white text directly below the title, same font style. ` : '')
                + `The background must be full bleed behind all text. Korean people if people appear.`;

            console.log(`[ContentFactory] 썸네일 image_prompts[0] 교체 완료 (style=${thumbnailConfig.style}, bg_type=${thumbnailConfig.bg_type})`);
            console.log(`[ContentFactory] 썸네일 프롬프트: "${result.image_prompts[0].substring(0, 100)}..."`);
        }

        return result;
    }

    parseOutput(markdown, dataAsset, triggerType = 'manual') {
        let title = "";
        let content = "";
        let imagePrompts = [];
        let hashtags = [];

        // 1. Title Extraction
        const titleMatch = markdown.match(/###\s*\[?SEO_TITLE\]?[\s:]*\n?(.*?)\n/i) || markdown.match(/제목:?\s*(.*?)\n/i);
        title = titleMatch ? titleMatch[1].trim().replace(/[#]/g, '') : "네이버 블로그 포스팅";
        // [B]...[/B] 등 서식 태그 제거
        title = title.replace(/\[\/?(B|I|U|QUOTE[^\]]*)\]/gi, '').trim();
        // 제목에서 연도(4자리 숫자 + 선택적 "년") 제거 — "2026년 강릉여행" → "강릉여행", "강릉여행 2026" → "강릉여행"
        title = title.replace(/\b(19|20)\d{2}년?\s*/g, '').replace(/\s*(19|20)\d{2}년?\b/g, '').trim();
        // 제목에서 AI 관련 표현 제거 — "AI 추천", "AI와", "AI가" 등
        title = title.replace(/\bAI\s*(추천|와|와의|가|로|을|를|의|전문가|기반|활용|분석)?\s*/gi, '').trim();
        // 선두/선미 불필요 구두점 정리
        title = title.replace(/^[,:·\-–—\s]+|[,:·\-–—\s]+$/g, '').trim();

        // 2. Content Extraction - Much more aggressive split
        const sections = markdown.split(/###\s*\[?/i);
        for (const section of sections) {
            if (section.startsWith('POST_CONTENT') || section.toLowerCase().startsWith('post_content')) {
                content = section.replace(/^POST_CONTENT\]?[\s:]*/i, '').trim();
                break;
            }
        }

        // If above failed, fallback to old method
        if (!content) {
            const contentPart = markdown.split(/###\s*\[?POST_CONTENT\]?/i)[1];
            if (contentPart) content = contentPart.trim();
        }

        // 3. Cleanup Content - Remove everything from the first occurrence of other headers
        const stopHeaders = [
            /###\s*\[?HASHTAGS\]?/i,
            /###\s*\[?IMAGE_PROMPTS_LIST\]?/i,
            /###\s*\[?SEO_GUIDELINES\]?/i,
            /###\s*\[?SEO_STATS\]?/i,
            /###\s*\[?HASHTAG\]?/i,
            /IMAGE_PROMPTS_LIST/i,
            /SEO_GUIDELINES/i
        ];

        for (const header of stopHeaders) {
            content = content.split(header)[0].trim();
        }

        // AI가 [/B] 대신 [/] 또는 [/<B>], [/</B>], [/\<B>], [/B>] 등을 잘못 생성하는 경우 자동 수정
        content = content.replace(/\[\/\]/g, '[/B]');
        content = content.replace(/\[\/\s*<?\/?\\?\s*B\s*>?\s*\]/gi, '[/B]');
        content = content.replace(/\[\s*<?\/?\\?\s*B\s*>?\s*\]/gi, '[B]');

        // AI가 [IMAGEANCHOR1], [IMAGE_ANCHOR1], [IMAGEANCHOR_1] 등 언더스코어가 빠진 이미지 태그 표준화
        content = content.replace(/\[IMAGE_?ANCHOR_?(\d+)\]/gi, '[IMAGE_ANCHOR_$1]');

        // AI가 [QUOTE_VERTICAL]+[IMAGE_ANCHOR_X]를 혼용해 [QUOTEANCHOR3] 같은 잘못된 태그를 만드는 경우 제거
        content = content.replace(/\[\/?(QUOTEANCHOR\d*|IMAGEQUOTE\d*|QUOTEIMAGE\d*)\]/gi, '');

        // 4. Hashtags Extraction
        const hashtagPart = markdown.split(/###\s*\[?HASHTAGS?\]?/i)[1] || markdown.split(/해시태그 모음/i)[1] || markdown.split(/해시태그/i)[1];
        if (hashtagPart) {
            const rawTags = hashtagPart.split(/###/)[0].match(/#[\w가-힣]+/g) || [];
            rawTags.forEach(t => {
                const cleaned = t.trim();
                if (cleaned.length > 1 && !hashtags.includes(cleaned)) hashtags.push(cleaned);
            });
        }

        // 5. Image Prompts Extraction
        const promptsPart = markdown.split(/###\s*\[?IMAGE_PROMPTS_LIST\]?/i)[1];
        if (promptsPart) {
            const lines = promptsPart.split(/###/)[0].trim().split('\n');
            lines.forEach(line => {
                let p = line.replace(/^[\[\(]?\d+[\.:\s]*이미지\s*\d+([\s:]*\(.*?\))?[\s:]*[\]\)]?/, '');
                p = p.replace(/^[-*+•\s]+/, '').trim();
                if (p && p.length > 5) imagePrompts.push(p);
            });
        }

        // 6. Final Cleanup & Safety
        content = content.replace(/\*\*/g, '').replace(/__/g, '').replace(/_/g, '').replace(/`/g, '');

        // Remove footer markers that AI shouldn't output
        content = content.replace(/-{2,}\s*\[?필수 풋터 시작\]?\s*-{2,}/g, '');
        content = content.replace(/-{2,}\s*\[?필수 풋터 끝\]?\s*-{2,}/g, '');
        content = content.replace(/<풋터 내용 시작>/g, '');
        content = content.replace(/<풋터 내용 끝>/g, '');

        // Remove trailing JSON if it exists (very common failure mode)
        content = content.replace(/\{[\s\n]*"mainkeyword":[\s\S]*\}[\s\n]*$/i, '').trim();
        content = content.replace(/###\s*\[?SEO_GUIDELINES\]?[\s\S]*$/i, '').trim();

        // QUOTE_VERTICAL 태그 안에 본문 내용(50자 초과 또는 줄바꿈 포함)이 들어온 경우 태그 제거
        // AI가 소제목 대신 본문 문단을 인용구 태그로 감싸는 오류를 방지
        content = content.replace(/\[QUOTE_?VERTICAL\]([\s\S]*?)\[\/QUOTE_?VERTICAL\]/gi, (_match, inner) => {
            const singleLine = inner.replace(/\n+/g, ' ').trim();
            if (singleLine.length > 50) {
                // 소제목이 아닌 본문 내용 → 태그 제거하고 텍스트만 반환
                return singleLine;
            }
            return '[QUOTE_VERTICAL]' + singleLine + '[/QUOTE_VERTICAL]';
        });

        // Ensure hashtags from keywords if missing
        if (hashtags.length === 0) {
            const extraTags = (markdown.match(/#[\w가-힣]+/g) || []);
            extraTags.forEach(t => { if (t.length > 2 && !hashtags.includes(t)) hashtags.push(t); });
        }
        if (hashtags.length === 0) {
            const kws = [dataAsset.target_keywords.main, ...dataAsset.target_keywords.sub];
            hashtags = kws.map(k => `#${k.replace(/\s+/g, '')}`);
        }

        // Add extracted hashtags back to the content body for visibility
        if (hashtags.length > 0) {
            content += "\n\n\n" + hashtags.join(" ");
        }

        let finalPrompts = imagePrompts;
        if (triggerType === 'image_reference' && dataAsset.image_paths) {
            finalPrompts = imagePrompts.slice(0, dataAsset.image_paths.length);
        } else {
            finalPrompts = imagePrompts.length >= 8 ? imagePrompts.slice(0, 8) : this._dummyPrompts(dataAsset.target_keywords.main, imagePrompts);
        }

        return {
            title,
            content,
            image_prompts: finalPrompts,
            hashtags: hashtags.slice(0, 15),
            seo_guidelines: { main_keyword: dataAsset.target_keywords.main }
        };
    }

    _dummyPrompts(keyword, existing) {
        const dummies = [...existing];
        while (dummies.length < 8) {
            dummies.push(`${keyword} 여행의 생생하고 아름다운 현장을 담은 감성적인 사진`);
        }
        return dummies;
    }
}

module.exports = ContentFactory;
