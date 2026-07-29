const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const _ = require('lodash');
require('dotenv').config();
const path = require('path');
const sharp = require('sharp');

const GEMINI_IMAGE_MAX_DIMENSION = 1568;

/**
 * Gemini 토큰 폭증 방지: 원본 해상도 그대로 보내면 세로로 긴 캡처 이미지 등에서
 * 타일 수(=토큰 수)가 과도하게 늘어나 input token limit(1,048,576)을 초과할 수 있음.
 * 긴 변 기준 리사이즈 + JPEG 재압축 후 전달.
 */
async function resizeImageForGemini(buffer) {
    try {
        const resized = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .resize({
                width: GEMINI_IMAGE_MAX_DIMENSION,
                height: GEMINI_IMAGE_MAX_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 82 })
            .toBuffer();
        return { data: resized.toString('base64'), mimeType: 'image/jpeg' };
    } catch (e) {
        console.error(`[SmartIntake] 이미지 리사이즈 실패, 원본 사용: ${e.message}`);
        return null;
    }
}

// Gemini 응답이 끊긴 채 돌아오지 않는 경우(네트워크 stall 등) 무한 대기하지 않도록
// module2_factory.js의 withTimeout과 동일한 패턴을 적용 — 이 파일 안에서만 사용됨
const GEMINI_TIMEOUT_MS = 120000; // 2분
const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini API timeout after ${ms / 1000}s`)), ms))
]);

/**
 * 429 Too Many Requests 자동 재시도 + 다단계 모델 폴백 헬퍼
 * 순서: 원본 모델 → gemini-2.5-flash-lite → retryDelay 대기 후 재시도
 */
async function generateContentWithRetry(model, promptParts, genAI = null) {
    const FALLBACK_MODELS = ['gemini-2.5-flash-lite'];
    let fallbackIdx = 0;
    let currentModel = model;

    const parseWaitSec = (errMsg) => {
        const m = errMsg.match(/"retryDelay"\s*:\s*"(\d+)/) || errMsg.match(/retry in (\d+)/i);
        return m ? parseInt(m[1]) + 3 : 62;
    };

    // 1단계: 폴백 모델 순서대로 즉시 시도 (대기 없음)
    while (genAI && fallbackIdx < FALLBACK_MODELS.length) {
        try {
            return await withTimeout(currentModel.generateContent(promptParts), GEMINI_TIMEOUT_MS);
        } catch (e) {
            const is429 = e.message && (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('RESOURCE_EXHAUSTED'));
            if (!is429) throw e;
            const next = FALLBACK_MODELS[fallbackIdx++];
            console.warn(`[Gemini] 429 (${currentModel.model || '?'}) — ${next} 폴백 전환...`);
            currentModel = genAI.getGenerativeModel({ model: next });
        }
    }

    // 2단계: 모든 폴백 소진 → retryDelay 대기 후 최대 2회 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await withTimeout(currentModel.generateContent(promptParts), GEMINI_TIMEOUT_MS);
        } catch (e) {
            const is429 = e.message && (e.message.includes('429') || e.message.includes('Too Many Requests') || e.message.includes('RESOURCE_EXHAUSTED'));
            if (!is429 || attempt === 1) throw e;
            const waitSec = parseWaitSec(e.message);
            console.warn(`[Gemini] 429 모든 모델 소진 — ${waitSec}초 대기 후 재시도...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
        }
    }
}

/**
 * Module 1: Smart Intake
 * Role: Data Extraction & Keyword Analyst
 */
class SmartIntake {
    constructor(apiKey) {
        this.inputType = 'Text';
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey.trim());
            // Robust model initialization for this environment
            const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
            let initialized = false;
            for (const m of models) {
                try {
                    this.model = this.genAI.getGenerativeModel({ model: m });
                    initialized = true;
                    break;
                } catch (e) { }
            }
            if (!initialized) this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        }
    }

    detectInputType(input) {
        if (!input) return 'Text';
        const inputs = input.split(',').map(i => i.trim());
        const first = inputs[0];

        // URL 패턴 확인
        const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
        if (urlPattern.test(first)) {
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(first.split('?')[0]);
            return isImage ? 'IMAGE' : 'URL';
        }

        // 로컬 파일 경로 확인 (Windows 드라이브 문자 또는 /로 시작)
        const isLocalPath = /^[a-zA-Z]:\\/.test(first) || first.startsWith('/') || fs.existsSync(first);
        if (isLocalPath) {
            // 이미지 또는 동영상/GIF 파일이 하나라도 있으면 IMAGE 모드로 처리
            // (Gemini에는 이미지만 전달되고, 동영상은 발행 시 별도 업로드됨)
            const hasMedia = inputs.some(p => /\.(jpg|jpeg|png|webp|gif|mp4|mov|avi|webm)$/i.test(p));
            return hasMedia ? 'IMAGE' : 'Text';
        }

        return 'Text';
    }

    async scrapeUrl(url) {
        const puppeteer = require('puppeteer');
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-dev-shm-usage'
                ]
            });
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            console.log(`[SmartIntake] Scraping URL with browser: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Handle Naver Blog frames
            let targetFrame = page.mainFrame();
            const frame = page.frames().find(f => f.name() === 'mainFrame');
            if (frame) targetFrame = frame;

            const data = await targetFrame.evaluate(() => {
                const title = document.title;
                // Remove noise
                document.querySelectorAll('script, style, nav, footer, iframe, ads, .ads, #ads').forEach(el => el.remove());
                const content = document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 15000);
                const images = Array.from(document.querySelectorAll('img'))
                    .map(img => img.src)
                    .filter(src => src && src.startsWith('http'))
                    .slice(0, 10);
                return { title, content, images };
            });

            return data;
        } catch (error) {
            console.error(`[SmartIntake] Puppeteer error: ${error.message}`);
            throw new Error(`URL 스캔 실패 (${error.message}). 자연어 모드로 전환해 주세요.`);
        } finally {
            if (browser) await browser.close();
        }
    }

    async analyzeWithAI(rawData, keywordConfig = {}) {
        if (!this.model) throw new Error("API Key가 설정되지 않았습니다.");

        const naverAd = require('./naver_ad_api');
        const { main_keyword, sub_keywords, min_volume, max_volume } = keywordConfig;

        // Phase 1: Keyword Detection & Real Stats Fetch
        let realStats = null;
        let targetKeyword = main_keyword;

        if (!targetKeyword) {
            // Ask AI to pick a primary keyword first
            const pickPrompt = `입력된 데이터: ${JSON.stringify(rawData)}\n이 내용을 바탕으로 네이버 블로그 포스팅을 위한 가장 핵심적인 '메인 키워드' 딱 하나만 리턴해줘. (텍스트만 출력)`;
            const pickResult = await generateContentWithRetry(this.model, pickPrompt, this.genAI);
            targetKeyword = (await pickResult.response).text().trim();
        }

        if (targetKeyword) {
            console.log(`[SmartIntake] Fetching real stats for: ${targetKeyword} (병렬 조회)`);

            const adApiKeyword = targetKeyword.replace(/\s+/g, '');

            // 1. 광고 API 검색량 + 2. 블로그 포스트 수 — 병렬 실행
            const [stats, postCountResult] = await Promise.all([
                // 1. Fetch Search Volume
                naverAd.getKeywordStats([adApiKeyword]).catch(e => {
                    console.warn(`[SmartIntake] Ad API 실패: ${e.message}`);
                    return null;
                }),
                // 2. Fetch Post Count via Naver Search Scrape
                (async () => {
                    try {
                        const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(targetKeyword)}`;
                        const { data: searchHtml } = await axios.get(searchUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                            timeout: 5000
                        });
                        const $search = cheerio.load(searchHtml);
                        let countText = '';
                        $search('*').each((i, el) => {
                            const t = $search(el).text();
                            if (t.includes(' / ') && t.includes('건')) {
                                countText = t;
                                return false;
                            }
                        });
                        if (countText) {
                            const match = countText.match(/([0-9,]+)건/);
                            if (match) return parseInt(match[1].replace(/,/g, ''));
                        }
                        return 0;
                    } catch (e) {
                        console.warn(`[SmartIntake] 포스트 수 조회 실패: ${e.message}`);
                        return 0;
                    }
                })()
            ]);

            let monthly_volume = 0;
            if (stats && stats.length > 0) {
                const match = stats.find(k => k.relKeyword === adApiKeyword) || stats[0];
                monthly_volume = (parseInt(match.monthlyPcQcCnt) || 0) + (parseInt(match.monthlyMobileQcCnt) || 0);
            }

            realStats = {
                keyword: targetKeyword,
                monthly_volume: monthly_volume || '조회불가',
                post_count: postCountResult || '조회불가'
            };
        }

        // Phase 2: Final Analysis with Multimodal AI
        let promptParts = [];
        let systemPrompt = `
[Role: Data Extraction & Keyword Analyst]
너는 안티그래비티 워크플로우의 첫 번째 관문인 '데이터 추출 및 분석 전문가'야. 입력된 원시 데이터(텍스트 또는 이미지)를 분석하여 Module 2(원고 생성)가 바로 사용할 수 있는 [Clean Data Asset]을 JSON 형식으로 출력하라.

1. 입력 데이터 정보:
- Type: ${this.inputType}
- User Description/Topic: ${JSON.stringify(rawData.content || 'N/A')}
- User Keyword Config: ${JSON.stringify(keywordConfig)}
${realStats ? `- REAL STATS FOUND: 검색량=${realStats.monthly_volume}, 발행량=${realStats.post_count} (반드시 이 수치를 그대로 기입할 것. 임의 수정 조작 절대 불가)` : ''}

2. 임무:
- 이미지 또는 텍스트 상세 분석:
    - 이미지가 제공되었다면 이미지의 상황, 장소, 분위기, 피사체를 정밀하게 분석하여 블로그 주제와 연결하세요.
    - 사용자의 설명(Topic)이 있다면 이를 최우선 반영하세요.
- 키워드 선정 절대 규칙:
    - 만약 User Keyword Config에 main_keyword가 있다면 반드시 그 키워드를 사용할 것.
    - 메인 키워드: ${targetKeyword}
    - 만약 sub_keywords가 있다면 이를 기반으로 하고, 부족하다면 추가로 선정할 것.

- 상세 분석 지표:
    - 핵심 키워드 1개와 서브 키워드 3~4개 선정.
    - 월간 검색량: ${realStats ? `"${realStats.monthly_volume}"을 그대로 기입할 것` : 'AI가 추정하여 제시'}
    - 월간 발행량: ${realStats ? `"${realStats.post_count}"을 그대로 기입할 것` : 'AI가 추정하여 제시'}
    - 포화도 산출: (월간 발행량 / 월간 검색량) 기준으로 분석하여 '블루오션', '낮음', '보통', '높음', '레드오션'으로 구분하라.

3. 출력 형식 (Strict JSON Only):
{
  "input_type": "${this.inputType}",
  "concept": "Blog_Writer", 
  "target_keywords": {
    "main": "${targetKeyword}",
    "sub": ["서브1", "서브2", "서브3"],
    "analysis": {
      "monthly_volume": ${realStats ? `"${realStats.monthly_volume}"` : '"AI 추정 수치"'},
      "monthly_post_count": ${realStats ? `"${realStats.post_count}"` : '"AI 추정 발행량"'},
      "saturation": "포화도 등급",
      "saturation_desc": "상세 설명",
      "saturation_score": 0.5 
    }
  },
  "extracted_data": {
    "title": "이미지와 설명에 기반한 매력적인 제목",
    "price": "가격 정보 (있으면 추출, 없으면 N/A)",
    "schedule": "일정/시간 정보 (있으면 추출, 없으면 N/A)",
    "benefits": ["특징1", "특징2"],
    "location": "분석된 지역/장소"
  },
  "分析_report": "이미지 분석 결과와 셀링 포인트 요약"
}
`;
        promptParts.push({ text: systemPrompt });

        if (this.inputType === 'IMAGE' && rawData.images && rawData.images.length > 0) {
            for (const img of rawData.images) {
                promptParts.push({
                    inlineData: {
                        data: img.data,
                        mimeType: img.mimeType || "image/jpeg"
                    }
                });
            }
        }

        const result = await generateContentWithRetry(this.model, promptParts, this.genAI);
        const response = await result.response;
        return JSON.parse(response.text().replace(/```json|```/g, '').trim());
    }

    async process(rawInput, keywordConfig = {}) {
        if (config.useDummyContent) {
            console.log(`[SmartIntake] 🤖 Dummy Mode Active - Returning mock data asset`);
            const targetKeyword = keywordConfig.main_keyword || "인천공항 근처 호텔 추천";
            return {
                input_type: this.detectInputType(rawInput),
                concept: "Travel_Agency",
                target_keywords: {
                    main: targetKeyword,
                    sub: ["인천공항 호텔", "공항 근처 숙박", "파라다이스시티", "영종도 호캉스"],
                    analysis: {
                        monthly_volume: "15,400",
                        monthly_post_count: "2,300",
                        saturation: "낮음",
                        saturation_desc: "검색량 대비 발행량이 적어 노출 확률이 매우 높습니다.",
                        saturation_score: 0.15
                    }
                },
                extracted_data: {
                    title: `${targetKeyword} 가성비 갑 베스트 3`,
                    price: "평균 10만원대",
                    schedule: "공항 셔틀 10분 거리",
                    benefits: ["조식 포함", "무료 주차 7일", "얼리 체크인"],
                    location: "인천광역시 중구"
                },
                analysis_report: "공항 접근성과 가성비를 중점적으로 다룸. 실제 투숙객 후기 기반의 생생한 정보를 제공함."
            };
        }

        const type = this.detectInputType(rawInput);
        this.inputType = type;

        let rawData = {};
        if (type === 'URL') {
            rawData = await this.scrapeUrl(rawInput);
        } else if (type === 'IMAGE') {
            const allPaths = rawInput.split(',').map(u => u.trim()).filter(u => u);
            const mediaMeta = keywordConfig._media_meta || null;

            // Gemini에게는 이미지 파일만 전달 (동영상/비이미지 제외)
            const imagePaths = allPaths.filter((p, idx) => {
                if (mediaMeta) {
                    const meta = mediaMeta.find(m => m.path === p);
                    if (meta) return meta.mediaType === 'image';
                }
                // fallback: 확장자로 판별
                return /\.(jpg|jpeg|png|webp|gif)$/i.test(p);
            });

            console.log(`[SmartIntake] Gemini 전달 이미지: ${imagePaths.length}/${allPaths.length}개 (동영상/비이미지 제외)`);

            const imagePromises = imagePaths.map(async (p) => {
                try {
                    let buffer;
                    // 로컬 파일인 경우
                    if (fs.existsSync(p)) {
                        buffer = fs.readFileSync(p);
                    }
                    // URL인 경우
                    else {
                        const response = await axios.get(p, { responseType: 'arraybuffer' });
                        buffer = Buffer.from(response.data, 'binary');
                    }

                    const resized = await resizeImageForGemini(buffer);
                    if (resized) return resized;

                    // 리사이즈 실패 시 원본 그대로 폴백
                    const ext = path.extname(p).toLowerCase().replace('.', '');
                    const mimeType = ext === 'jpg' ? 'image/jpeg' : (ext ? `image/${ext}` : 'image/jpeg');
                    return { data: buffer.toString('base64'), mimeType: mimeType };
                } catch (e) {
                    console.error(`[SmartIntake] Failed to process image ${p}: ${e.message}`);
                    return null;
                }
            });

            const processedImages = (await Promise.all(imagePromises)).filter(img => img);
            rawData = {
                images: processedImages,
                content: keywordConfig.topic || ""
            };
        } else {
            rawData = { content: rawInput };
        }

        const result = await this.analyzeWithAI(rawData, keywordConfig);

        // 이미지 참조 모드인 경우 원본 이미지 경로도 함께 반환
        if (type === 'IMAGE') {
            result.image_paths = rawInput.split(',').map(p => p.trim()).filter(p => p);
        }

        return result;
    }
}

module.exports = SmartIntake;
