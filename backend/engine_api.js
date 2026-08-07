const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const multer = require('multer');
const coupangApi = require('./coupang_api');

const xhsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

require('dotenv').config();

const app = express();
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
// verify로 원본 body 문자열을 req.rawBody에 함께 보존 — PortOne 웹훅 서명 검증에
// raw body가 필요한데, 이 전역 파서가 이미 JSON으로 소비해버려서 이후 라우트에서는
// 원본 문자열을 다시 얻을 수 없기 때문. 다른 라우트의 req.body 파싱 동작에는 영향 없음.
app.use(express.json({ limit: '50mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Supabase client (service_role bypasses RLS)
const ws = require('ws');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { transport: ws } }
);

// ════════════════════════════════════════
//  인메모리 로그 버퍼 (확장프로그램 팝업에서 조회용)
// ════════════════════════════════════════
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];

function extLog(level, ...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const entry = { ts: Date.now(), level, msg };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(msg);
}

// ════════════════════════════════════════
//  Global Logging Middleware
// ════════════════════════════════════════
app.use((req, res, next) => {
    console.log(`[Engine API Incoming] ${req.method} ${req.url}`);
    next();
});

// Auth middleware — only for sensitive routes
function authMiddleware(req, res, next) {
    const secret = req.headers['x-engine-secret'];
    if (secret !== process.env.ENGINE_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

/**
 * 유틸리티: Base64 미디어(이미지/동영상/GIF)를 로컬 임시 파일로 저장
 * item: string(레거시 base64) 또는 { data, mediaType, mimeType } 객체
 * 반환: { path, mediaType, mimeType } 또는 null
 */
function parseDataUrl(str) {
    // 정규식 대신 indexOf/slice 사용 — 대용량 동영상 base64에서 정규식이 실패하는 버그 방지
    const marker = ';base64,';
    const markerIdx = str.indexOf(marker);
    if (str.startsWith('data:') && markerIdx !== -1) {
        return {
            mimeType: str.slice(5, markerIdx),
            rawBase64: str.slice(markerIdx + marker.length)
        };
    }
    return null;
}

function saveBase64Media(item, index) {
    try {
        let rawBase64, mimeType, mediaType;

        if (typeof item === 'string') {
            // 레거시: 순수 base64 문자열
            const parsed = parseDataUrl(item);
            if (parsed) {
                mimeType = parsed.mimeType;
                rawBase64 = parsed.rawBase64;
            } else {
                rawBase64 = item;
                mimeType = 'image/jpeg';
            }
            mediaType = 'image';
        } else {
            // 신규: { data, mediaType, mimeType } 객체
            const b64str = item.data || '';
            const parsed = parseDataUrl(b64str);
            if (parsed) {
                mimeType = parsed.mimeType;
                rawBase64 = parsed.rawBase64;
            } else {
                rawBase64 = b64str;
                mimeType = item.mimeType || 'image/jpeg';
            }
            mediaType = item.mediaType || 'image';
        }

        // MIME → 확장자 매핑
        const mimeToExt = {
            'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
            'image/webp': 'webp', 'image/gif': 'gif',
            'video/mp4': 'mp4', 'video/quicktime': 'mov',
            'video/x-msvideo': 'avi', 'video/webm': 'webm'
        };
        const extension = mimeToExt[mimeType] || mimeType.split('/')[1] || 'bin';

        const buffer = Buffer.from(rawBase64, 'base64');
        const uploadDir = path.join(__dirname, 'temp_uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = `upload_${Date.now()}_${index}.${extension}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);

        return { path: filePath, mediaType, mimeType };
    } catch (e) {
        console.error(`[Engine API] Failed to save base64 media: ${e.message}`);
        return null;
    }
}


// ════════════════════════════════════════
//  GET /api/naver/search-place — Naver Local Search
// ════════════════════════════════════════
app.get('/api/naver/search-place', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    try {
        console.log(`[Engine API] Searching place: ${query}`);
        const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
            params: { query, display: 5 },
            headers: {
                'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
            }
        });

        // HTML 태그 제거 (<b>태그 등)
        const items = (response.data.items || []).map(item => ({
            ...item,
            title: item.title.replace(/<[^>]*>?/gm, '')
        }));

        res.json(items);
    } catch (e) {
        console.error(`[Engine API] Naver Local Search Error: ${e.response?.data || e.message}`);
        res.status(500).json({ error: 'Naver search failed', detail: e.response?.data });
    }
});


// ════════════════════════════════════════
//  POST /api/posts/preview — Generate draft
// ════════════════════════════════════════
app.post('/api/posts/preview', async (req, res) => {
    let { topic, reference_url, image_data, category, account_prompts, main_keyword, sub_keywords, min_volume, max_volume, custom_instructions, seo_category, gemini_api_key, thumbnail_text_config } = req.body;
    
    // 프론트엔드에서 직접 미디어 데이터(Base64)를 보냈다면 로컬에 저장하고 경로로 변환
    if (image_data && Array.isArray(image_data) && image_data.length > 0) {
        console.log(`[Engine API] Processing ${image_data.length} direct media uploads...`);
        const mediaResults = image_data.map((item, idx) => saveBase64Media(item, idx)).filter(r => r !== null);
        if (mediaResults.length > 0) {
            // 경로만 추출해서 reference_url로 설정 (module1_intake 호환)
            reference_url = mediaResults.map(r => r.path).join(',');
            // 미디어 타입 메타데이터를 별도 키로 전달 (module1_intake에서 활용)
            req.body._media_meta = mediaResults.map(r => ({ path: r.path, mediaType: r.mediaType, mimeType: r.mimeType }));
            console.log(`[Engine API] Direct media saved: ${mediaResults.map(r => `${r.mediaType}:${r.path}`).join(', ')}`);
        }
    }

    if (!topic && !reference_url) return res.status(400).json({ error: 'topic or reference_url required' });

    const SmartIntake = require('./module1_intake');
    const ContentFactory = require('./module2_factory');

    try {
        const primaryInput = reference_url || topic;
        const resolvedApiKey = gemini_api_key || null;
        if (!resolvedApiKey) return res.status(400).json({ error: '제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.' });
        console.log(`[Engine API] Generating preview for: ${primaryInput.substring(0, 50)}... (key: user)`);
        const intake = new SmartIntake(resolvedApiKey);
        const mediaMeta = req.body._media_meta || null;
        console.log(`[Engine API] _media_meta: ${JSON.stringify(mediaMeta?.map(m => m.mediaType))}`);
        const dataAsset = await intake.process(primaryInput, {
            topic,
            main_keyword,
            sub_keywords,
            min_volume,
            max_volume,
            custom_instructions,
            _media_meta: mediaMeta
        });

        const factory = new ContentFactory(resolvedApiKey);
        const content = await factory.generate(dataAsset, { ...account_prompts, custom_instructions, seo_category, thumbnail_text_config }, req.body.trigger_type || 'manual');
        console.log(`[Engine API] Preview Result - Keyword: ${dataAsset.target_keywords?.main}, SEO Stats: ${content.seo_guidelines ? 'O' : 'X'}`);

        res.json({
            title: content.title,
            body: content.content,
            image_prompts: content.image_prompts,
            hashtags: content.hashtags,
            thumbnail_text: content.thumbnail_text || null,
            data_asset: dataAsset,
            reference_url: reference_url, // Return processed local paths or updated URL
            // media_meta를 루트 레벨에 명시적으로 포함 (executor에서 직접 참조)
            media_meta: dataAsset.media_meta || req.body._media_meta || null,
            keyword_analysis: dataAsset.target_keywords?.analysis || null,
            seo_stats: content.seo_guidelines || null
        });

    } catch (err) {
        console.error(`[Engine API] Preview error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  발행 큐 시스템 — 동시 실행 최대 3개 제한
// ════════════════════════════════════════
class ExecutionQueue {
    constructor(maxConcurrent = 3) {
        this.running = 0;
        this.queue = [];
        this.maxConcurrent = maxConcurrent;
    }

    add(job) {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return job()
                .finally(() => { this.running--; this._next(); });
        }
        console.log(`[Queue] 대기 중... (실행: ${this.running}/${this.maxConcurrent}, 대기: ${this.queue.length + 1})`);
        return new Promise((resolve, reject) => {
            this.queue.push({ job, resolve, reject });
        });
    }

    _next() {
        if (this.queue.length === 0) return;
        const { job, resolve, reject } = this.queue.shift();
        this.running++;
        console.log(`[Queue] 대기 작업 시작 (남은 대기: ${this.queue.length})`);
        job()
            .then(resolve)
            .catch(reject)
            .finally(() => { this.running--; this._next(); });
    }

    get status() {
        return { running: this.running, queued: this.queue.length };
    }
}

const postExecutionQueue = new ExecutionQueue(3);

// ════════════════════════════════════════
//  비동기 원고 생성 — 인메모리 잡 스토어
// ════════════════════════════════════════
const previewJobStore = new Map();

// 컨셉별 키워드 풀(concept_keyword_pool) 온디맨드 생성 중복 트리거 방지용
// (같은 컨셉을 여러 사용자가 동시에 처음 선택해도 생성은 1회만 돌도록)
const conceptPoolGenerating = new Set();

app.post('/api/posts/preview-async', authMiddleware, async (req, res) => {
    const previewId = require('crypto').randomUUID();
    previewJobStore.set(previewId, { status: 'generating' });
    res.json({ preview_id: previewId });

    (async () => {
        try {
            let { topic, reference_url, image_data, category, account_prompts,
                  main_keyword, sub_keywords, min_volume, max_volume,
                  custom_instructions, seo_category, gemini_api_key,
                  thumbnail_text_config, trigger_type } = req.body;

            if (image_data && Array.isArray(image_data) && image_data.length > 0) {
                const mediaResults = image_data.map((item, idx) => saveBase64Media(item, idx)).filter(r => r !== null);
                if (mediaResults.length > 0) {
                    reference_url = mediaResults.map(r => r.path).join(',');
                    req.body._media_meta = mediaResults.map(r => ({ path: r.path, mediaType: r.mediaType, mimeType: r.mimeType }));
                }
            }

            const SmartIntake = require('./module1_intake');
            const ContentFactory = require('./module2_factory');

            const resolvedApiKey = gemini_api_key || null;
            if (!resolvedApiKey) {
                previewJobStore.set(previewId, { status: 'error', error: '제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.' });
                return;
            }
            const intake = new SmartIntake(resolvedApiKey);
            const mediaMeta = req.body._media_meta || null;
            const dataAsset = await intake.process(reference_url || topic, {
                topic, main_keyword, sub_keywords, min_volume, max_volume,
                custom_instructions, _media_meta: mediaMeta
            });

            const factory = new ContentFactory(resolvedApiKey);
            const content = await factory.generate(dataAsset, {
                ...account_prompts, custom_instructions, seo_category, thumbnail_text_config,
                image_source: req.body.image_source || 'gemini'
            }, trigger_type || 'manual');

            previewJobStore.set(previewId, {
                status: 'done',
                result: {
                    title: content.title,
                    body: content.content,
                    image_prompts: content.image_prompts,
                    hashtags: content.hashtags,
                    thumbnail_text: content.thumbnail_text || null,
                    data_asset: dataAsset,
                    reference_url,
                    media_meta: dataAsset.media_meta || req.body._media_meta || null,
                    keyword_analysis: dataAsset.target_keywords?.analysis || null,
                    seo_stats: content.seo_guidelines || null
                }
            });
        } catch (err) {
            console.error(`[Preview Async] Error: ${err.message}`);
            previewJobStore.set(previewId, { status: 'error', error: err.message });
        }
        // 30분 후 자동 정리
        setTimeout(() => previewJobStore.delete(previewId), 30 * 60 * 1000);
    })();
});

app.get('/api/posts/preview-status/:id', authMiddleware, (req, res) => {
    const job = previewJobStore.get(req.params.id);
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

// ════════════════════════════════════════
//  POST /api/posts/trigger — Execute a post
// ════════════════════════════════════════
app.post('/api/posts/trigger', authMiddleware, async (req, res) => {
    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    try {
        // 1. Fetch the post and associated account
        const { data: post, error: fetchError } = await supabase
            .from('posts')
            .select('*, naver_accounts(*)')
            .eq('id', post_id)
            .single();

        if (fetchError || !post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // 1-1. Fetch user's Gemini API key separately (graceful: null if column missing)
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('gemini_api_key')
                .eq('id', post.user_id)
                .single();
            post.profiles = profile || null;
        } catch (_) {
            post.profiles = null;
        }

        // 2. Update status to 'generating'
        // stuck_check_since: 발행 정체 워치독(scheduler.js checkStuckExtensionJobs)이 "처리가
        // 실제로 시작된 시각"으로 참조하는 기준점 — /api/extension/prepare에도 동일하게 세팅함
        await supabase.from('posts').update({ status: 'generating', stuck_check_since: new Date().toISOString() }).eq('id', post_id);

        console.log(`[Engine API] Triggering post: ${post.topic} (key: ${post.profiles?.gemini_api_key ? 'user' : 'default'})`);

        // 3. 큐를 통해 순서대로 실행 (동시 실행 최대 3개 제한)
        postExecutionQueue.add(() => executePipeline(post)).catch(err => {
            console.error(`[Engine API] Pipeline error: ${err.message}`);
        });
        console.log(`[Engine API] Queue status: ${JSON.stringify(postExecutionQueue.status)}`);

        res.json({ status: 'triggered', post_id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  GET /api/posts/:id/status — Check status
// ════════════════════════════════════════
app.get('/api/posts/:id/status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('posts')
            .select('id, status, naver_post_url, error_message, completed_at')
            .eq('id', req.params.id)
            .single();

        if (error) return res.status(404).json({ error: 'Post not found' });
        if (!data) return res.status(404).json({ error: 'Post not found' });

        // Parse progress pipe from error_message
        let progress = null;
        if (data.error_message && data.error_message.startsWith('PROGRESS_V2|')) {
            const parts = data.error_message.split('|');
            progress = {
                step: parts[1] || '',
                message: parts[2] || '',
                percent: parseInt(parts[3]) || 0,
                timeRemaining: parts[4] || ''
            };
        }

        res.json({
            ...data,
            progress,
            // Don't leak PROGRESS_V2 pipe as actual error_message
            error_message: (data.error_message && data.error_message.startsWith('PROGRESS_V2|')) ? null : data.error_message
        });
    } catch (err) {
        console.error(`[Engine API] Status check error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  GET /api/prompts/:category — Get prompts
// ════════════════════════════════════════
app.get('/api/prompts/:category', async (req, res) => {
    const { data, error } = await supabase
        .from('prompt_vault')
        .select('*')
        .eq('category', req.params.category)
        .eq('is_active', true)
        .single();

    if (error) return res.status(404).json({ error: 'Prompt not found' });
    res.json(data);
});

// ════════════════════════════════════════
//  POST /api/keywords/analyze — Black Kiwi style
// ════════════════════════════════════════
app.post('/api/keywords/analyze', async (req, res) => {
    const { keyword, webhook_url, gemini_api_key } = req.body;
    console.log(`[Engine API] POST /api/keywords/analyze requested for: ${keyword} (key: ${gemini_api_key ? 'user' : 'none'})`);
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    if (!gemini_api_key) return res.status(400).json({ error: '제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.' });

    const KeywordEngine = require('./keyword_analysis');
    const engine = new KeywordEngine(gemini_api_key);

    try {
        const result = await engine.analyze(keyword, { webhookUrl: webhook_url });
        console.log(`[Engine API] Success! Returning ${result.analysis_pool?.length || 0} items in pool for keyword: ${keyword}`);
        res.json(result);
    } catch (err) {
        console.error(`[Engine API] Analysis Error for ${keyword}: ${err.message}`);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.post('/api/keywords/trend', async (req, res) => {
    const { keywords, options } = req.body;
    console.log(`[Engine API] POST /api/keywords/trend requested for: ${keywords.join(', ')}`);
    if (!keywords || !Array.isArray(keywords)) return res.status(400).json({ error: 'keywords array required' });

    const KeywordEngine = require('./keyword_analysis');
    const engine = new KeywordEngine();

    try {
        const trend = await engine.getAdvancedTrend(keywords, options);
        res.json({ trend });
    } catch (err) {
        console.error(`[Engine API] Trend Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});


// ════════════════════════════════════════
//  POST /api/keywords/chat-suggest — 대시보드 대화형 키워드 추천
//  사용자와의 대화에서 핵심키워드/서브키워드/주제요약을 뽑아내고, 충분히 모이면
//  실제 네이버 검색량까지 붙여서 "이대로 발행할까요?" 형태로 제안한다.
// ════════════════════════════════════════
app.post('/api/keywords/chat-suggest', authMiddleware, async (req, res) => {
    const { history, gemini_api_key } = req.body;
    if (!Array.isArray(history) || history.length === 0) return res.status(400).json({ error: 'history required' });
    if (!gemini_api_key) return res.status(400).json({ error: '제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.' });

    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(gemini_api_key.trim());
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const transcript = history
            .slice(-20)
            .map(h => `${h.role === 'user' ? '사용자' : '어시스턴트'}: ${h.text}`)
            .join('\n');

        const prompt = `당신은 네이버 블로그 글감을 정하도록 도와주는 어시스턴트입니다. 아래 대화를 보고, 포스팅을 시작하기에 충분한 정보(핵심 키워드, 서브 키워드 2~4개, 어떤 내용으로 쓸지 한두 문장 요약)가 모였는지 판단하세요.

[대화 내역]
${transcript}

[규칙]
- 정보가 부족하거나 주제가 너무 막연하면 ready=false로 하고, reply에 짧은 후속 질문을 하나만 하세요. 이 경우 main_keyword/sub_keywords/topic은 null로 두세요.
- 충분하면 ready=true로 하고:
  - main_keyword: 사용자가 네이버 검색창에 실제로 검색할 법한 2~3단어 조합의 대표 검색어 (예: '부산 국밥 맛집', '부산 돼지국밥'). 절대로 '부산 현지인 추천 국밥 맛집' 같은 긴 서술형 문장을 main_keyword로 쓰지 마세요.
  - sub_keywords: 사용자가 함께 검색하는 실질적인 연관 검색 키워드 2~4개 배열 (예: ['부산 돼지국밥', '부산 현지인 맛집', '부산 국밥 추천'])
  - topic: 어떤 내용으로 쓸지 1~2문장 요약
  - reply에는 이 내용을 자연스럽게 요약해서 "이대로 포스팅을 시작할까요?"라고 물어보세요.
- reply는 항상 친근한 한국어 존댓말로 3문장 이내.
- 반드시 아래 JSON 형식으로만 출력하세요 (다른 텍스트 절대 금지):
{"reply": "...", "ready": true, "main_keyword": "...", "sub_keywords": ["...", "..."], "topic": "..."}`;

        const result = await model.generateContent(prompt);
        const rawText = result.response.text();
        let parsed;
        try {
            parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
        } catch (e) {
            return res.status(500).json({ error: 'AI 응답 해석에 실패했습니다. 다시 한 번 말씀해주세요.' });
        }

        const responseBody = {
            reply: parsed.reply || '음, 다시 한 번 말씀해주시겠어요?',
            ready: !!(parsed.ready && parsed.main_keyword),
        };

        if (responseBody.ready) {
            let mainKw = (parsed.main_keyword || '').trim();
            let subKws = Array.isArray(parsed.sub_keywords) ? parsed.sub_keywords.map(s => String(s).trim()).filter(Boolean).slice(0, 4) : [];
            const topic = parsed.topic || mainKw;
            const stripSpace = (s) => (s || '').replace(/\s+/g, '');

            try {
                const naverAd = require('./naver_ad_api');
                const hints = [stripSpace(mainKw), ...subKws.map(stripSpace)].filter(Boolean);
                const stats = await naverAd.getKeywordStats(hints);

                if (stats && stats.length > 0) {
                    const statsMap = new Map();
                    stats.forEach(item => {
                        const vol = (parseInt(item.monthlyPcQcCnt) || 0) + (parseInt(item.monthlyMobileQcCnt) || 0);
                        statsMap.set(item.relKeyword, vol);
                    });

                    let mainVol = statsMap.get(stripSpace(mainKw)) ?? 0;

                    // 유사도 검사 유틸리티 (글자 포함 관계 및 핵심 키워드 유사성)
                    const isSimilarKeyword = (kw1, kw2) => {
                        const s1 = stripSpace(kw1);
                        const s2 = stripSpace(kw2);
                        if (s1 === s2) return true;
                        if (s1.length >= 3 && s2.length >= 3) {
                            if (s1.includes(s2) || s2.includes(s1)) return true;
                            let common = 0;
                            for (const char of s1) { if (s2.includes(char)) common++; }
                            if (common / Math.max(s1.length, s2.length) >= 0.65) return true;
                        }
                        return false;
                    };

                    // 만약 AI가 뽑은 main_keyword의 검색량이 적거나 0이고, 네이버 연관 데이터 중 유사하면서 검색량이 훨씬 높은 실제 키워드가 있다면 자동 보정
                    const sortedStats = [...stats].sort((a, b) => {
                        const volA = (parseInt(a.monthlyPcQcCnt) || 0) + (parseInt(a.monthlyMobileQcCnt) || 0);
                        const volB = (parseInt(b.monthlyPcQcCnt) || 0) + (parseInt(b.monthlyMobileQcCnt) || 0);
                        return volB - volA;
                    });

                    const betterStat = sortedStats.find(s => {
                        const vol = (parseInt(s.monthlyPcQcCnt) || 0) + (parseInt(s.monthlyMobileQcCnt) || 0);
                        return vol > mainVol && isSimilarKeyword(mainKw, s.relKeyword);
                    });

                    if (betterStat) {
                        const betterVol = (parseInt(betterStat.monthlyPcQcCnt) || 0) + (parseInt(betterStat.monthlyMobileQcCnt) || 0);
                        const matchedSub = subKws.find(s => stripSpace(s) === betterStat.relKeyword);
                        mainKw = matchedSub || betterStat.relKeyword;
                        mainVol = betterVol;
                    }


                    const subKwDetails = subKws.map(kw => ({
                        keyword: kw,
                        volume: statsMap.get(stripSpace(kw)) ?? 0
                    }));

                    responseBody.main_keyword = mainKw;
                    responseBody.volume = mainVol;
                    responseBody.sub_keywords = subKwDetails;
                    responseBody.topic = topic;
                } else {
                    responseBody.main_keyword = mainKw;
                    responseBody.volume = 0;
                    responseBody.sub_keywords = subKws.map(kw => ({ keyword: kw, volume: 0 }));
                    responseBody.topic = topic;
                }
            } catch (e) {
                console.warn('[Keyword Chat] Volume lookup error:', e.message);
                responseBody.main_keyword = mainKw;
                responseBody.volume = 0;
                responseBody.sub_keywords = subKws.map(kw => ({ keyword: kw, volume: 0 }));
                responseBody.topic = topic;
            }
        }

        res.json(responseBody);
    } catch (err) {
        console.error(`[Engine API] Keyword chat error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});


// ════════════════════════════════════════
//  GET /api/recommendations — 계정 컨셉 기반 키워드 추천
// ════════════════════════════════════════
app.get('/api/recommendations', async (req, res) => {
    const { account_id, user_id } = req.query;
    if (!account_id || !user_id) return res.status(400).json({ error: 'account_id and user_id required' });

    try {
        const { data: account, error: accErr } = await supabase
            .from('naver_accounts')
            .select('concept')
            .eq('id', account_id)
            .eq('user_id', user_id)
            .single();

        if (accErr || !account) return res.status(404).json({ error: 'Account not found' });

        const concept = account.concept;

        const { data: posts } = await supabase
            .from('posts')
            .select('topic, completed_at, naver_post_url')
            .eq('naver_account_id', account_id)
            .eq('status', 'success');

        // 사용한 키워드 → 발행일/URL 맵
        const usedPostsMap = new Map();
        (posts || []).forEach(p => {
            const kw = p.topic?.split('|||')[0]?.trim().toLowerCase();
            if (kw) usedPostsMap.set(kw, { completed_at: p.completed_at, url: p.naver_post_url });
        });
        const usedKeywords = new Set(usedPostsMap.keys());

        // concept_keyword_pool — Gemini가 월 1회 생성해둔 컨셉별 키워드 풀에서 읽어온다.
        // (예전엔 여기서 네이버 연관키워드 API를 매 요청마다 실시간 호출했으나, 연관키워드 하나로는
        //  "추천"이라 부르기엔 폭이 좁아 Gemini 월간 배치 생성 + DB 캐시 방식으로 교체함)
        const { data: poolRows, error: poolErr } = await supabase
            .from('concept_keyword_pool')
            .select('keyword, search_volume, comp_idx, saturation')
            .eq('concept', concept);

        if (poolErr) {
            console.error(`[Recommendations] concept_keyword_pool 조회 실패: ${poolErr.message}`);
            return res.status(500).json({ error: poolErr.message });
        }

        if (!poolRows || poolRows.length === 0) {
            // 이 컨셉은 아직 키워드 풀이 한 번도 생성된 적 없음(신규 컨셉) → 온디맨드로 1회 생성 트리거.
            // 생성에는 수십 초가 걸리므로 응답은 즉시 'generating' 상태로 내려주고, 프론트가 잠시 후 재조회한다.
            if (!conceptPoolGenerating.has(concept)) {
                conceptPoolGenerating.add(concept);
                console.log(`[Recommendations] "${concept}" 키워드 풀 없음 — 온디맨드 생성 시작`);
                const KeywordEngine = require('./keyword_analysis');
                const keywordEngine = new KeywordEngine(process.env.GEMINI_API_KEY);
                keywordEngine.generateConceptKeywordPool(concept)
                    .catch(err => console.error(`[Recommendations] "${concept}" 온디맨드 생성 실패: ${err.message}`))
                    .finally(() => conceptPoolGenerating.delete(concept));
            }
            return res.json({ status: 'generating', keywords: [], all_keywords: [], used_keywords: [], concept });
        }

        // 프론트 표시 형식(total_volume/competition)에 맞춰 매핑
        const parsedStats = poolRows.map(row => ({
            keyword: row.keyword,
            total_volume: row.search_volume ?? 0,
            competition: row.comp_idx || '높음',
            saturation: row.saturation || '측정중',
        }));

        // 사용한 추천 키워드 (풀 내에서 이미 발행 성공한 것)
        const usedRecommendationKeywords = parsedStats
            .filter(k => usedKeywords.has(k.keyword.toLowerCase()))
            .map(k => ({
                ...k,
                ...usedPostsMap.get(k.keyword.toLowerCase()),
            }))
            .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

        // 미사용 키워드 → 네이버 검색량 기준 정렬 (100개 전부 받아온 뒤 검색량순으로만 정렬)
        const allKeywords = parsedStats
            .filter(k => !usedKeywords.has(k.keyword.toLowerCase()))
            .sort((a, b) => b.total_volume - a.total_volume);

        const keywords = allKeywords.slice(0, 10);

        res.json({ status: 'ready', keywords, all_keywords: allKeywords, used_keywords: usedRecommendationKeywords, concept });
    } catch (err) {
        console.error('[Recommendations] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ════════════════════════════════════════
//  POST /api/prompts — Upsert prompt (Admin)
// ════════════════════════════════════════
app.post('/api/prompts', async (req, res) => {
    const { category, content_prompt, image_prompt, description } = req.body;
    const { data, error } = await supabase
        .from('prompt_vault')
        .upsert({ category, content_prompt, image_prompt, description, updated_at: new Date().toISOString() }, { onConflict: 'category' })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ════════════════════════════════════════
//  GET /api/accounts/:id/categories — Extract categories from Naver blog
// ════════════════════════════════════════
app.get('/api/accounts/:id/categories', async (req, res) => {
    try {
        const accountId = req.params.id || req.query.accountId;
        const { data: account, error } = await supabase
            .from('naver_accounts')
            .select('naver_id')
            .eq('id', accountId)
            .single();

        if (error || !account) return res.status(404).json({ error: 'Account not found' });

        const naverId = account.naver_id.trim().split('@')[0];
        console.log(`[Engine API] Fetching categories for: ${naverId}`);

        const EXCLUDED = new Set(['전체보기', '게시판', '메모', '프롤로그']);

        // DOM 트리 깊이로 하위 카테고리 판단: <li> 조상이 2개 이상이면 하위
        function parseCategoriesFromDom($) {
            const result = [];
            $('a[href*="categoryNo="]').each((i, el) => {
                const href = $(el).attr('href') || '';
                const idMatch = href.match(/categoryNo=(\d+)/);
                const text = $(el).text().trim().replace(/\s*\(\d+\)\s*$/, '').trim();
                if (!idMatch || !text || EXCLUDED.has(text)) return;
                const id = idMatch[1];
                if (result.find(c => c.id === id)) return;
                // <li> 조상 개수: 1개 = 최상위, 2개 이상 = 하위 카테고리
                const isSub = $(el).parents('li').length > 1;
                result.push({ id, name: text, isSub });
            });
            return result;
        }

        let categories = [];

        // Method 1 (PRIMARY): WidgetListAsync — 실제 사이드바 위젯 HTML, 네이버와 동일한 순서 보장
        try {
            const url = `https://blog.naver.com/WidgetListAsync.naver?blogId=${naverId}&enableWidgetKeys=category`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': `https://blog.naver.com/${naverId}`
                },
                timeout: 8000,
                transformResponse: [(data) => data]
            });

            let widgetHtml = '';

            // Case 1: 표준 JSON 응답
            try {
                const jsonData = JSON.parse(response.data);
                if (jsonData.category && jsonData.category.content) {
                    widgetHtml = jsonData.category.content;
                }
            } catch (e) {
                // Case 2: 비표준 JS 객체 형식 (e.g., "category : { content : '...' }")
                // HTML 내부에 이스케이프된 따옴표(\')가 있어 단순 정규식 불가 — 문자 단위 탐색
                const rawData = response.data;
                const catIdx = rawData.indexOf('category');
                if (catIdx >= 0) {
                    const contentIdx = rawData.indexOf("content :", catIdx);
                    if (contentIdx >= 0) {
                        const quoteStart = rawData.indexOf("'", contentIdx + 9);
                        if (quoteStart >= 0) {
                            let i = quoteStart + 1;
                            while (i < rawData.length) {
                                if (rawData[i] === '\\' && rawData[i+1] === "'") {
                                    i += 2;
                                } else if (rawData[i] === "'") {
                                    break;
                                } else {
                                    i++;
                                }
                            }
                            widgetHtml = rawData.substring(quoteStart + 1, i)
                                .replace(/\\'/g, "'")
                                .replace(/\\"/g, '"')
                                .replace(/\\n/g, '\n');
                        }
                    }
                }
            }

            if (widgetHtml) {
                console.log(`[Engine API] Widget HTML length: ${widgetHtml.length}`);
                const $w = cheerio.load(widgetHtml);
                categories = parseCategoriesFromDom($w);
                console.log(`[Engine API] Method 1 (Widget): ${categories.length} categories`);
            } else {
                console.warn(`[Engine API] Method 1: No widget HTML found for ${naverId}`);
            }
        } catch (e) {
            console.warn(`[Engine API] Method 1 (Widget) failed: ${e.message}`);
        }

        // Method 2 (FALLBACK): PostList — Widget이 0개 반환 시에만 실행
        if (categories.length === 0) {
            try {
                const url = `https://blog.naver.com/PostList.naver?blogId=${naverId}`;
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 8000
                });
                const $ = cheerio.load(response.data);
                categories = parseCategoriesFromDom($);
                console.log(`[Engine API] Method 2 (PostList fallback): ${categories.length} categories`);
            } catch (e) {
                console.warn(`[Engine API] Method 2 (PostList) failed: ${e.message}`);
            }
        }

        console.log(`[Engine API] Successfully fetched ${categories.length} categories for ${naverId}`);
        res.json({ categories });

    } catch (err) {
        console.error(`[Engine API] Category fetch error: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
    }
});

// ════════════════════════════════════════
//  GET /api/rankings/:post_id — Get rankings
// ════════════════════════════════════════
app.get('/api/rankings/:post_id', async (req, res) => {
    const { data, error } = await supabase
        .from('rankings')
        .select('*')
        .eq('post_id', req.params.post_id)
        .order('checked_at', { ascending: false })
        .limit(7);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ════════════════════════════════════════
//  POST /api/rankings/check — 수동 순위 체크 (Naver Search API)
// ════════════════════════════════════════
app.post('/api/rankings/check', authMiddleware, async (req, res) => {
    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    try {
        const { data: post, error: fetchError } = await supabase
            .from('posts')
            .select('id, topic, naver_post_url, naver_accounts(naver_id)')
            .eq('id', post_id)
            .single();

        if (fetchError || !post) return res.status(404).json({ error: 'Post not found' });

        // topic에서 키워드 추출 (|||JSON 분리)
        const rawTopic = post.topic || '';
        let keyword = rawTopic.split('|||')[0];
        if (rawTopic.includes('|||')) {
            try {
                const keywordConfig = JSON.parse(rawTopic.split('|||')[1]);
                keyword = keywordConfig.main_keyword || keyword;
            } catch (e) {}
        }
        keyword = keyword.trim();

        const blogId = post.naver_accounts?.naver_id?.trim().split('@')[0];
        if (!keyword || !blogId) {
            return res.status(400).json({ error: '키워드 또는 블로그 ID를 확인할 수 없습니다.' });
        }

        const naverClientId = process.env.NAVER_CLIENT_ID?.trim();
        const naverClientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
        if (!naverClientId || !naverClientSecret) {
            return res.status(400).json({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' });
        }

        // 네이버 블로그 검색 API로 상위 100개 결과에서 순위 탐색
        const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
            params: { query: keyword, display: 100, start: 1 },
            headers: {
                'X-Naver-Client-Id': naverClientId,
                'X-Naver-Client-Secret': naverClientSecret
            },
            timeout: 10000
        });

        const items = response.data.items || [];
        let rankPosition = null;
        for (let i = 0; i < items.length; i++) {
            const bloggerlink = (items[i].bloggerlink || '').toLowerCase();
            const link = (items[i].link || '').toLowerCase();
            const targetId = blogId.toLowerCase();
            if (bloggerlink.includes(`/${targetId}`) || link.includes(`blog.naver.com/${targetId}`)) {
                rankPosition = i + 1;
                break;
            }
        }

        // 오늘 날짜 범위 계산 (KST 기준)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // 오늘 이미 저장된 데이터 확인
        const { data: existingToday } = await supabase
            .from('rankings')
            .select('rank_position, keyword, checked_at')
            .eq('post_id', post_id)
            .gte('checked_at', todayStart.toISOString())
            .lte('checked_at', todayEnd.toISOString())
            .order('checked_at', { ascending: false })
            .limit(1);

        if (existingToday && existingToday.length > 0) {
            console.log(`[Rankings] 오늘 이미 체크됨 (${blogId} / "${keyword}") → 기존 데이터 반환`);
            return res.json({
                keyword,
                blog_id: blogId,
                rank_position: existingToday[0].rank_position,
                cached: true
            });
        }

        if (rankPosition !== null) {
            await supabase.from('rankings').insert({
                post_id,
                keyword,
                rank_position: rankPosition,
                search_page: Math.ceil(rankPosition / 10),
                total_results: response.data.total || null,
            });

            // 30일 초과 데이터 삭제
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('rankings')
                .delete()
                .eq('post_id', post_id)
                .lt('checked_at', thirtyDaysAgo);
        }

        console.log(`[Rankings] Manual check: "${keyword}" (${blogId}) → ${rankPosition ? `#${rankPosition}위` : '100위 밖'}`);
        res.json({ keyword, blog_id: blogId, rank_position: rankPosition });

    } catch (err) {
        console.error(`[Rankings] Manual check error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  POST /api/rankings/keyword-search — 키워드 직접 검색 (내 블로그만 필터, 1~200위)
// ════════════════════════════════════════
app.post('/api/rankings/keyword-search', authMiddleware, async (req, res) => {
    const { keyword, blog_ids } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    if (!blog_ids || !Array.isArray(blog_ids) || blog_ids.length === 0) {
        return res.status(400).json({ error: 'blog_ids required' });
    }

    const naverClientId = process.env.NAVER_CLIENT_ID?.trim();
    const naverClientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
    if (!naverClientId || !naverClientSecret) {
        return res.status(400).json({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' });
    }

    const fetchPage = async (start) => {
        const r = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
            params: { query: keyword, display: 100, start },
            headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret },
            timeout: 10000
        });
        return r.data;
    };

    try {
        // 1~200위 병렬 호출
        const [data1, data2] = await Promise.all([fetchPage(1), fetchPage(101)]);

        const results = [];

        const matchItem = (item, startRank) => {
            const bloggerlink = (item.bloggerlink || '').toLowerCase();
            const link = (item.link || '').toLowerCase();
            for (const blogId of blog_ids) {
                const targetId = blogId.toLowerCase();
                if (bloggerlink.includes(`/${targetId}`) || link.includes(`blog.naver.com/${targetId}`)) {
                    return {
                        rank: startRank,
                        blog_id: blogId,
                        title: (item.title || '').replace(/<[^>]*>/g, ''),
                        link: item.link || '',
                        description: (item.description || '').replace(/<[^>]*>/g, ''),
                        postdate: item.postdate || ''
                    };
                }
            }
            return null;
        };

        (data1.items || []).forEach((item, i) => {
            const matched = matchItem(item, i + 1);
            if (matched) results.push(matched);
        });

        (data2.items || []).forEach((item, i) => {
            const matched = matchItem(item, 101 + i);
            if (matched) results.push(matched);
        });

        results.sort((a, b) => a.rank - b.rank);

        console.log(`[Rankings] Keyword search: "${keyword}" → ${results.length}개 발견 (1~200위 탐색)`);
        res.json({ keyword, results, total: data1.total || 0 });

    } catch (err) {
        console.error(`[Rankings] Keyword search error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  Pipeline Execution
// ════════════════════════════════════════
async function updateProgress(postId, step, message, percent = 0, timeRemaining = '') {
    console.log(`[Progress] ${postId} - ${step}: ${message} (${percent}%)`);

    try {
        const progressString = `PROGRESS_V2|${step}|${message}|${percent}|${timeRemaining}`;

        // Non-blocking update to prevent hanging
        supabase.from('posts').update({
            error_message: progressString
        }).eq('id', postId).then(({ error }) => {
            if (error) console.error(`[Progress DB Error] ${error.message}`);
        }).catch(e => {
            console.error(`[Progress Exception] ${e.message}`);
        });
    } catch (e) {
        console.error(`[Progress Logic Error] ${e.message}`);
    }
}

async function isCancelled(postId) {
    const { data } = await supabase.from('posts').select('status, error_message').eq('id', postId).single();
    if (data?.error_message === '사용자에 의해 취소됨' || data?.status === 'failed') {
        console.log(`[Engine] Cancellation detected for post ${postId}`);
        return true;
    }
    return false;
}

async function executePipeline(post) {
    // 0. Cleanup previous instances to prevent ghost browsers (non-blocking, max 3s)
    if (global.executor_instance) {
        const prev = global.executor_instance;
        global.executor_instance = null;
        if (prev.browser) {
            const timeout = new Promise(resolve => setTimeout(resolve, 3000));
            Promise.race([prev.browser.close().catch(() => {}), timeout]).catch(() => {});
        }
    }

    const SmartIntake = require('./module1_intake');
    const ContentFactory = require('./module2_factory');
    const AssetManager = require('./module3_assets');
    const ExecutionAgent = require('./module4_executor');

    try {
        // 0. Start
        await updateProgress(post.id, '시작', '시스템을 초기화하고 작업을 준비 중입니다...', 5, '약 6분 남음');
        if (await isCancelled(post.id)) throw new Error('Cancelled by user');

        // Parse topic and hidden keyword config
        let actualTopic = post.topic || 'AI 추천 주제';
        let keywordConfig = {};
        if (actualTopic.includes('|||')) {
            const parts = actualTopic.split('|||');
            actualTopic = parts[0];
            try { keywordConfig = JSON.parse(parts[1]); } catch (e) { }
        }

        // Gemini API key — user profile key or env fallback
        const resolvedApiKey = post.profiles?.gemini_api_key || process.env.GEMINI_API_KEY || null;

        // ─── Check if content is already pre-generated from preview ─────────
        const preGenerated = post.content_json?._pre_generated;
        let dataAsset, content;
        let customPrompts = null;

        // Populate customPrompts from account level regardless of pre-generation
        if (post.naver_accounts?.custom_content_prompt || post.naver_accounts?.custom_image_prompt || post.naver_accounts?.custom_thumbnail_prompt || post.naver_accounts?.custom_formatting_prompt) {
            customPrompts = {
                content_prompt: post.naver_accounts.custom_content_prompt,
                image_prompt: post.naver_accounts.custom_image_prompt,
                thumbnail_prompt: post.naver_accounts.custom_thumbnail_prompt,
                formatting_prompt: post.naver_accounts.custom_formatting_prompt,
                business: {
                    phone: post.naver_accounts.biz_phone,
                    kakao_id: post.naver_accounts.biz_kakao_id,
                    kakao_url: post.naver_accounts.biz_kakao_url,
                    map_address: post.naver_accounts.biz_map_address,
                    cta_image_url: post.naver_accounts.biz_cta_image_url,
                    footer_text: post.naver_accounts.biz_footer_text,
                    image_links: post.naver_accounts.biz_image_links || {},
                    footer_components: post.naver_accounts.biz_footer_components || []
                }
            };
        }

        if (preGenerated) {
            console.log('[Engine] ✅ Pre-generated content found — skipping Module 1 & 2');
            await updateProgress(post.id, '원고 재사용', '미리보기에서 생성한 원고를 재사용합니다...', 35, '약 3분 남음');

            // Reconstruct content and dataAsset from stored pre-generated data
            const storedTitle = post.content_json.title;
            // thumbnail_text: content_json에 저장된 값 우선, 없으면 keywordConfig에서 직접 결정
            let preGenThumbnailText = post.content_json.thumbnail_text || null;
            if (!preGenThumbnailText && keywordConfig.thumbnail_text_config?.enabled) {
                preGenThumbnailText = keywordConfig.thumbnail_text_config.type === 'custom' && keywordConfig.thumbnail_text_config.custom_text
                    ? keywordConfig.thumbnail_text_config.custom_text
                    : storedTitle;
            }
            const preGenThumbnailSubText = post.content_json.thumbnail_sub_text || keywordConfig.thumbnail_text_config?.sub_text || null;
            content = {
                title: storedTitle,
                content: post.content_json.body || post.content_json.content,
                hashtags: post.content_json.hashtags,
                image_prompts: post.content_json.image_prompts,
                thumbnail_text: preGenThumbnailText,
                thumbnail_sub_text: preGenThumbnailSubText,
                thumbnail_style: post.content_json.thumbnail_style || keywordConfig.thumbnail_text_config?.style || 'bottom_bar',
                thumbnail_text_color: post.content_json.thumbnail_text_color || keywordConfig.thumbnail_text_config?.text_color || 'white',
                thumbnail_bg_type: post.content_json.thumbnail_bg_type || keywordConfig.thumbnail_text_config?.bg_type || 'image',
                thumbnail_bg_color: post.content_json.thumbnail_bg_color || keywordConfig.thumbnail_text_config?.bg_color || null,
                seo_guidelines: post.content_json.seo_stats || post.content_json.seo_guidelines,
            };
            dataAsset = post.content_json.data_asset || { target_keywords: { main: actualTopic } };

        } else {
            // Module 1: Intake
            await updateProgress(post.id, '데이터 분석', '입력된 주제를 분석하여 최신 트렌드와 키워드를 추출하고 있습니다...', 15, '약 5분 남음');
            if (await isCancelled(post.id)) throw new Error('Cancelled by user');

            if (!resolvedApiKey) throw new Error('제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.');
            const intake = new SmartIntake(resolvedApiKey);
            dataAsset = await intake.process(actualTopic, keywordConfig);
            if (keywordConfig.custom_instructions) {
                dataAsset.custom_instructions = keywordConfig.custom_instructions;
            }

            // Module 2: Content
            await updateProgress(post.id, '원고 작성', '추출된 데이터를 바탕으로 SEO 최적화 블로그 원고를 생성하고 있습니다...', 35, '약 4분 남음');
            if (await isCancelled(post.id)) throw new Error('Cancelled by user');

            const factory = new ContentFactory(resolvedApiKey);

            // Fetch from vault if no account-specific prompts
            if (!customPrompts) {
                const { data: prompt } = await supabase
                    .from('prompt_vault')
                    .select('content_prompt, image_prompt, thumbnail_prompt')
                    .eq('category', post.category || '일상')
                    .eq('is_active', true)
                    .single();

                if (prompt) customPrompts = prompt;
            }

            if (keywordConfig.custom_instructions) {
                if (!customPrompts) customPrompts = {};
                customPrompts.custom_instructions = keywordConfig.custom_instructions;
            }

            // SEO 카테고리 설정
            if (keywordConfig.seo_category) {
                if (!customPrompts) customPrompts = {};
                customPrompts.seo_category = keywordConfig.seo_category;
            }

            // 썸네일 텍스트 이미지 설정
            if (keywordConfig.thumbnail_text_config) {
                if (!customPrompts) customPrompts = {};
                customPrompts.thumbnail_text_config = keywordConfig.thumbnail_text_config;
            }

            if (!customPrompts) customPrompts = {};
            customPrompts.image_source = imageSource;

            const actualTriggerType = post.content_json?._trigger_type || post.trigger_type;
            content = await factory.generate(dataAsset, customPrompts, actualTriggerType);
        }

        // Fetch business data for executor (merging into existing customPrompts or creating new)
        if (post.naver_accounts) {
            if (!customPrompts) customPrompts = {};
            
            const acc = post.naver_accounts;
            const fs = require('fs');
            const path = require('path');

            // 1. Resolve Map Address Priority
            let mapAddr = keywordConfig.publish_options?.map_address || post.naver_accounts.biz_map_address;
            
            // 2. Map Footer Components and Sync Map Address
            const footerDir = path.join(__dirname, 'assets', 'footer');
            if (!fs.existsSync(footerDir)) fs.mkdirSync(footerDir, { recursive: true });

            const footerComp = await Promise.all((acc.biz_footer_components || []).map(async comp => {
                if (comp.type === 'IMAGE') {
                    // id가 없으면 URL 마지막 경로 세그먼트를 식별자로 사용
                    const fileId = comp.id || (comp.url ? comp.url.split('/').pop().replace(/[^a-zA-Z0-9_-]/g, '_') : `img_${Date.now()}`);
                    const ext = comp.url ? (comp.url.split('?')[0].split('.').pop() || 'png') : 'png';
                    const permanentPath = path.join(footerDir, `footer_${fileId}.${ext}`);

                    if (fs.existsSync(permanentPath)) {
                        comp.localPath = permanentPath;
                        console.log(`[Engine] Footer image loaded from permanent storage: ${permanentPath}`);
                    } else if (comp.url && comp.url.startsWith('http')) {
                        // URL에서 다운로드 후 영구 저장
                        try {
                            const imgResp = await axios.get(comp.url, { responseType: 'arraybuffer', timeout: 15000 });
                            fs.writeFileSync(permanentPath, Buffer.from(imgResp.data));
                            comp.localPath = permanentPath;
                            console.log(`[Engine] Footer image downloaded and saved: ${permanentPath}`);
                        } catch (e) {
                            console.error(`[Engine] Footer image download failed (${comp.url}): ${e.message}`);
                        }
                    } else {
                        // 기존 루트 경로 파일 fallback
                        const legacyPath = path.join(__dirname, `temp_footer_${fileId}.png`);
                        if (fs.existsSync(legacyPath)) {
                            // 영구 폴더로 이동
                            fs.copyFileSync(legacyPath, permanentPath);
                            comp.localPath = permanentPath;
                            console.log(`[Engine] Footer image migrated to permanent storage: ${permanentPath}`);
                        }
                    }
                }

                // If this is a MAP component, ensure it uses our resolved priority address
                if (comp.type === 'MAP' && mapAddr) {
                    comp.address = mapAddr;
                }
                return comp;
            }));

            // 3. Fallback for mapAddr if still empty (use first MAP footer component)
            if (!mapAddr) {
                const mapComp = footerComp.find(c => c.type === 'MAP');
                if (mapComp) mapAddr = mapComp.address;
            }

            let ctaUrl = post.naver_accounts.biz_cta_image_url;
            if (!ctaUrl) {
                const imgComp = footerComp.find(c => c.type === 'IMAGE' && c.link_value);
                if (imgComp) ctaUrl = imgComp.url;
            }

            let phone = post.naver_accounts.biz_phone;
            if (!phone) {
                const textComp = footerComp.find(c => c.type === 'TEXT' && (c.content?.includes('📞') || c.content?.includes('010') || c.content?.includes('02-')));
                if (textComp) {
                    const match = textComp.content.match(/[\d]{2,3}-[\d]{3,4}-[\d]{4}/);
                    if (match) phone = match[0];
                }
            }

            // Merge business data WITHOUT overwriting previous customPrompts (like custom_instructions)
            customPrompts = {
                ...(customPrompts || {}),
                business: {
                    phone: phone,
                    kakao_id: post.naver_accounts.biz_kakao_id,
                    kakao_url: post.naver_accounts.biz_kakao_url,
                    map_address: mapAddr,
                    cta_image_url: ctaUrl,
                    footer_text: post.naver_accounts.biz_footer_text,
                    image_links: post.naver_accounts.biz_image_links || {},
                    footer_components: footerComp
                }
            };
        }

        // 사용자가 직접 미디어(이미지/동영상)를 업로드한 경우 감지
        // reference_url이 로컬 파일 경로이거나, media_meta에 항목이 있으면 사용자 미디어로 처리
        const userRefUrls = post.content_json?.reference_url || post.reference_url;
        const userMediaMeta = post.content_json?.media_meta || dataAsset?.media_meta || null;
        const hasUserMedia = !!(userRefUrls && userRefUrls.trim());
        const shouldSkipImageGen = config.skipImageGen || hasUserMedia;

        // Update post with generated content — reference_url과 media_meta도 함께 보존
        const contentJsonToStore = {
            ...content,
            // 사용자 미디어 정보 보존 (덮어쓰기 방지)
            reference_url: post.content_json?.reference_url || post.reference_url || undefined,
            media_meta: userMediaMeta || undefined,
        };
        await supabase.from('posts').update({
            status: 'posting',
            content_json: contentJsonToStore,
        }).eq('id', post.id);
        // in-memory post 객체도 동기화
        post.content_json = { ...post.content_json, ...contentJsonToStore };

        // Module 3: Assets
        let assetReport = { image_count: 0, images: [], asset_status: 'SKIPPED' };

        const isImmediatePublish = !keywordConfig.scheduled_at && !post.scheduled_at;

        if (shouldSkipImageGen) {
            if (hasUserMedia) {
                console.log(`[Engine] ⏩ 사용자 업로드 미디어 감지 — AI 이미지 생성 건너뜀`);
                await updateProgress(post.id, '이미지 생성', '업로드하신 미디어를 사용합니다.', 80, '텍스트 포스팅으로 넘어갑니다.');
            } else {
                console.log(`[Engine] ⏩ Skipping image generation (config.skipImageGen: true)`);
                await updateProgress(post.id, '이미지 생성', '요청하신 대로 이미지 생성을 임시 생략하고 빠른 발행을 진행합니다.', 80, '텍스트 포스팅으로 넘어갑니다.');
            }

            // 유저가 올린 원본 미디어(이미지/동영상/GIF)가 있다면 assetReport에 주입
            if (userRefUrls) {
                const parts = userRefUrls.split(',').map(url => url.trim()).filter(Boolean);
                if (parts.length > 0) {
                    assetReport.images = parts;
                    assetReport.image_count = parts.length;
                    // 미디어 타입 메타데이터가 있으면 함께 저장 (executor에서 video/gif 분기 처리용)
                    if (userMediaMeta) assetReport.media_meta = userMediaMeta;
                    const videoCount = userMediaMeta?.filter(m => m.mediaType === 'video').length || 0;
                    console.log(`[Engine] Retained ${parts.length} user-provided media (${videoCount} video) for publish mode.`);
                }
            }
        } else {
            await updateProgress(post.id, '이미지 생성', '본문에 어울리는 맞춤형 AI 이미지를 생성하기 위해 준비 중입니다...', 55, '약 3분 남음');
            if (await isCancelled(post.id)) throw new Error('Cancelled by user');

            if (!resolvedApiKey) throw new Error('제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.');
            console.log(`[Engine] content.thumbnail_text 값: ${JSON.stringify(content.thumbnail_text)}`);
            const imageSource = post.content_json?.image_source || keywordConfig.image_source || 'gemini';
            // 사용자가 미리 선택/업로드한 이미지(무료 이미지 모드의 Pexels 선택 또는 에디터에서
            // 직접 업로드한 사진)가 있으면 이미지 소스 모드와 무관하게 항상 그 이미지를 우선 사용한다.
            // (이미지 소스가 'gemini'로 남아있어도 직접 올린 사진이 조용히 무시되지 않도록)
            const selectedPexelsImages = (post.content_json?.selected_pexels_images || []).filter(Boolean);
            const resolvedImagePaths = selectedPexelsImages.length > 0
                ? selectedPexelsImages
                : (dataAsset.image_paths || []);
            const assets = new AssetManager(resolvedApiKey);
            assetReport = await assets.generateAll(
                content.image_prompts || [],
                dataAsset.target_keywords.main,
                content.title,
                {
                    image_paths: resolvedImagePaths,
                    triggerType: post.content_json?._trigger_type || post.trigger_type || 'manual',
                    thumbnailText: content.thumbnail_text || null,
                    thumbnailSubText: content.thumbnail_sub_text || null,
                    thumbnailStyle: content.thumbnail_style || 'bottom_bar',
                    thumbnailTextColor: content.thumbnail_text_color || 'white',
                    thumbnailBgType: content.thumbnail_bg_type || 'image',
                    thumbnailBgColor: content.thumbnail_bg_color || null,
                    imageSource,
                    // 계정에 저장된 이미지 프롬프트를 실제 이미지 생성 API 호출 시 프롬프트 끝에 직접 덧붙인다
                    // (module2_factory.js의 IMAGE_PROMPTS_LIST 작성 힌트와 별개로, 생성 시점에 확정 반영됨)
                    customImagePrompt: post.naver_accounts?.custom_image_prompt || null,
                    onProgress: async (current, total, prompt) => {
                        const percent = 55 + Math.floor((current / total) * 25); // 55% to 80%
                        const statusMsg = `이미지 준비 중 (${current}/${total} 완료)`;
                        const detailMsg = `[${current}/${total}] ${prompt.substring(0, 20)}...`;
                        await updateProgress(post.id, '이미지 생성', statusMsg, percent, detailMsg);
                    }
                }
            );
        }

        // Module 4: Execute (Naver posting)
        await updateProgress(post.id, '네이버 로그인', '네이버 계정으로 안전하게 로그인 중입니다...', 82, '약 2분 남음');

        if (await isCancelled(post.id)) throw new Error('Cancelled by user');

        const executor = new ExecutionAgent();
        global.executor_instance = executor;
        
        // 1. Launch & Login
        const naverId = post.naver_accounts?.naver_id;
        const naverPw = post.naver_accounts?.encrypted_password || process.env.NAVER_PW; // Fallback to env if not in DB
        
        if (!naverId || !naverPw) throw new Error("계정 정보(ID/PW)가 누락되었습니다.");

        const proxyConfig = post.naver_accounts?.proxy_host ? {
            host: post.naver_accounts.proxy_host,
            port: post.naver_accounts.proxy_port,
            username: post.naver_accounts.proxy_username || null,
            password: post.naver_accounts.proxy_password || null,
            type: post.naver_accounts.proxy_type || 'http',
        } : null;

        // Supabase에 저장된 쿠키 불러오기 (Railway 재시작 후에도 세션 유지)
        let savedCookies = null;
        const accountId = post.naver_accounts?.id;
        if (accountId) {
            const { data: cookieRow } = await supabase
                .from('naver_accounts')
                .select('session_cookies')
                .eq('id', accountId)
                .single();
            if (cookieRow?.session_cookies) {
                try {
                    savedCookies = typeof cookieRow.session_cookies === 'string'
                        ? JSON.parse(cookieRow.session_cookies)
                        : cookieRow.session_cookies;
                    console.log(`[Engine API] Loaded ${savedCookies.length} saved cookies for account ${accountId}`);
                } catch (e) {
                    console.warn(`[Engine API] Failed to parse saved cookies: ${e.message}`);
                }
            }
        }

        const onExecProgress = (step, percent, detail) => {
            updateProgress(post.id, step, detail, percent, '작업 진행 중...');
        };

        await executor.launch(naverId, naverPw, onExecProgress, true, proxyConfig, savedCookies);

        // 로그인 성공 후 쿠키 저장 (다음 발행 시 세션 복원용)
        if (accountId) {
            try {
                const freshCookies = await executor.getCookies();
                if (freshCookies && freshCookies.length > 0) {
                    await supabase
                        .from('naver_accounts')
                        .update({ session_cookies: JSON.stringify(freshCookies) })
                        .eq('id', accountId);
                    console.log(`[Engine API] ✅ Saved ${freshCookies.length} cookies to Supabase for account ${accountId}`);
                }
            } catch (e) {
                console.warn(`[Engine API] Failed to save cookies: ${e.message}`);
            }
        }
        
        // 2. Prepare Editor
        const frame = await executor.prepareEditor(onExecProgress);
        
        // 3. Execute (Type content & upload images)
        await executor.execute(content, assetReport, customPrompts?.business || {}, onExecProgress);

        // 4. Publish
        await updateProgress(post.id, '최종 발행', '발행 옵션을 설정하고 블로그에 게시를 진행 중입니다...', 95, '마무리 중...');

        const rawScheduledAt = keywordConfig.scheduled_at || post.scheduled_at;
        let finalScheduledAt = rawScheduledAt;
        
        if (rawScheduledAt) {
            let schedDate = new Date(rawScheduledAt);
            const now = new Date();
            const minLeadTime = 30; // 20분 대신 30분으로 넉넉하게 설정 (네이버 거부 방지)
            
            // 1. Initial safety check (at least 30 mins from now)
            if ((schedDate - now) / 60000 < minLeadTime) {
                schedDate = new Date(now.getTime() + minLeadTime * 60000);
            }
            
            // 2. Round UP to the next 10-minute increment for compatibility
            const minutes = schedDate.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 10) * 10;
            schedDate.setMinutes(roundedMinutes);
            schedDate.setSeconds(0);
            schedDate.setMilliseconds(0);
            
            finalScheduledAt = schedDate.toISOString();
            console.log(`[Engine API] Final adjusted scheduled time: ${finalScheduledAt} (Original: ${rawScheduledAt})`);
        }

        const publishOptions = {
            // 1. 기본 fallback 값 (DB 컬럼 — 프론트엔드 설정이 없는 경우에만 사용됨)
            visibility: post.visibility || 'all',

            // 2. 프론트엔드에서 전달된 발행 설정 우선 적용
            //    category_id (숫자 ID), topic_id (이름), visibility,
            //    allow_comments, allow_likes, allow_search 등 포함
            ...(keywordConfig.publish_options || {}),

            // 3. 시스템 계산값 — 항상 마지막으로 덮어씌움
            scheduled_at: finalScheduledAt
        };
        
        // 디버깅 로그 강화
        console.log(`[Engine API] [${new Date().toISOString()}] Final publishOptions: ${JSON.stringify(publishOptions)}`);
        console.log(`[Engine API] Calling publish with options:`, JSON.stringify(publishOptions));
        
        // Capture the actual published URL
        const publishedUrl = await executor.publish(publishOptions);

        // Mark as success
        // 1. Cleanup ID: remove spaces and @naver.com suffix
        const rawId = post.naver_accounts?.naver_id || '';
        const cleanId = rawId.trim().split('@')[0];
        
        // 2. Decide URL: use captured URL if it's external, otherwise fallback to cleaned home URL
        let finalPostUrl = publishedUrl;
        if (!publishedUrl || publishedUrl.includes('Redirect=Write') || publishedUrl.includes('nid.naver.com')) {
            finalPostUrl = `https://blog.naver.com/${cleanId}`;
        }

        await supabase.from('posts').update({
            status: 'success',
            naver_post_url: finalPostUrl,
            completed_at: new Date().toISOString(),
        }).eq('id', post.id);

        await updateProgress(post.id, '완료', '모든 작업이 성공적으로 마무리되었습니다!', 100, '완료');

    } catch (err) {
        const status = err.message === 'Cancelled by user' ? 'failed' : 'failed';
        await supabase.from('posts').update({
            status,
            error_message: err.message,
        }).eq('id', post.id);

        await updateProgress(post.id, '오류 발생', `중단됨: ${err.message}`, 0, '오류로 중단됨');
    } finally {
        // Ensure browser is always closed
        try {
            if (global.executor_instance?.browser) {
                await global.executor_instance.browser.close();
            }
        } catch (e) {}
    }
}

// ════════════════════════════════════════
//  Chrome Extension API
// ════════════════════════════════════════

// 확장 프로그램에서 생성된 이미지를 임시로 보관 (postId → [path, ...])
const extensionImageStore = new Map();

// 확장 프로그램 전용 토큰 기반 인증 미들웨어 (확장 프로그램 ↔ 백엔드)
// 더 이상 Supabase JWT를 검증하지 않는다 — 웹 대시보드 세션과 완전히 무관한 자체 발급
// 토큰이라, 그 세션이 백그라운드에서 refresh_token을 로테이션해도 이 토큰은 영향을 안 받는다
// (예전엔 이 로테이션 때문에 확장프로그램이 인증을 잃고 폴링이 멎는 문제가 있었음).
async function extensionAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token; // 이미지 GET 요청용 (chrome.downloads가 헤더를 못 붙임)
    const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) || tokenFromQuery;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const tokenHash = require('crypto').createHash('sha256').update(token, 'utf8').digest('hex');
    const { data: row, error } = await supabase
        .from('extension_tokens')
        .select('user_id, last_used_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
    if (error || !row) return res.status(401).json({ error: 'Invalid token' });

    req.user = { id: row.user_id };

    // last_used_at은 5분에 한 번만 갱신 — 30초마다 폴링하는데 매번 쓰면 DB 부하만 늘고
    // 표시용 정확도엔 의미 없음. 응답을 막지 않도록 fire-and-forget으로 처리.
    const stale = !row.last_used_at || (Date.now() - new Date(row.last_used_at).getTime() > 5 * 60 * 1000);
    if (stale) {
        supabase.from('extension_tokens')
            .update({ last_used_at: new Date().toISOString() })
            .eq('user_id', row.user_id)
            .then(() => {}, () => {});
    }

    next();
}

// GET /api/extension/verify — 토큰 유효성 확인 + 이메일 반환
// req.user는 이제 {id}만 갖고 있어서(Supabase 세션이 아니므로) email은 profiles에서 별도 조회
app.get('/api/extension/verify', extensionAuthMiddleware, async (req, res) => {
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', req.user.id).maybeSingle();
    res.json({ ok: true, email: profile?.email || null, id: req.user.id });
});

// GET /api/extension/logs — 최근 로그 조회 (팝업 뷰어용)
app.get('/api/extension/logs', extensionAuthMiddleware, (req, res) => {
    const since = parseInt(req.query.since || '0');
    const logs = since ? logBuffer.filter(e => e.ts > since) : logBuffer.slice(-100);
    res.json({ logs });
});

// POST /api/extension/prepare — M1+M2+M3 실행 후 pending_extension 상태로 설정
// 프론트엔드에서 x-engine-secret 헤더로 호출 (기존 authMiddleware 재사용)
app.post('/api/extension/prepare', authMiddleware, async (req, res) => {
    const { post_id, extension_device_id, hold_for_approval } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    try {
        const { data: post, error: fetchError } = await supabase
            .from('posts')
            .select('*, naver_accounts(*)')
            .eq('id', post_id)
            .single();
        if (fetchError || !post) return res.status(404).json({ error: 'Post not found' });

        try {
            const { data: profile } = await supabase
                .from('profiles').select('gemini_api_key').eq('id', post.user_id).single();
            post.profiles = profile || null;
        } catch (_) { post.profiles = null; }

        // stuck_check_since: 발행 정체 워치독이 참조하는 "처리 시작" 기준점 — /api/posts/trigger에도 동일하게 세팅함
        await supabase.from('posts').update({ status: 'generating', stuck_check_since: new Date().toISOString() }).eq('id', post_id);

        // 비동기로 실행 (즉시 응답 후 백그라운드 처리)
        prepareForExtension(post, extension_device_id, !!hold_for_approval).catch(err => {
            console.error(`[Extension Prepare] Error: ${err.message}`);
            supabase.from('posts').update({ status: 'failed', error_message: err.message }).eq('id', post_id);
        });

        res.json({ status: 'preparing', post_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  Supabase Storage 업로드 — 이미지 영구 보존 (Railway ephemeral FS 대응)
// ════════════════════════════════════════
const STORAGE_BUCKET = 'blogmaster-images';

async function ensureStorageBucket() {
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets?.find(b => b.name === STORAGE_BUCKET)) {
            await supabase.storage.createBucket(STORAGE_BUCKET, { public: true, fileSizeLimit: 10485760 });
            console.log(`[Storage] Bucket '${STORAGE_BUCKET}' created`);
        }
    } catch (e) {
        console.warn('[Storage] Bucket check/create failed:', e.message);
    }
}

async function uploadImagesToStorage(postId, imagePaths) {
    if (!imagePaths || imagePaths.length === 0) return imagePaths;

    await ensureStorageBucket();

    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
    };
    const uploadedUrls = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const localPath = imagePaths[i];
        try {
            if (!localPath) { uploadedUrls.push(localPath); continue; }
            if (typeof localPath === 'string' && localPath.startsWith('http')) {
                uploadedUrls.push(localPath); // 이미 HTTP URL이면 그대로
                continue;
            }
            if (!fs.existsSync(localPath)) {
                console.warn(`[Storage] Local file missing: ${localPath}`);
                uploadedUrls.push(localPath);
                continue;
            }
            const ext = path.extname(localPath).toLowerCase() || '.jpg';
            const storagePath = `posts/${postId}/${i}${ext}`;
            const fileBuffer = fs.readFileSync(localPath);
            const { error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(storagePath, fileBuffer, { contentType: mimeTypes[ext] || 'image/jpeg', upsert: true });
            if (error) throw new Error(error.message);
            const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
            uploadedUrls.push(publicUrl);
            console.log(`[Storage] Image ${i} uploaded → ${publicUrl}`);
        } catch (e) {
            console.warn(`[Storage] Upload failed for image ${i} (${localPath}): ${e.message}`);
            uploadedUrls.push(localPath); // 실패 시 로컬 경로로 폴백
        }
    }
    return uploadedUrls;
}

// "이미지 참조" 발행 시 브라우저가 references/ 경로에 직접 올려둔 임시 이미지를
// 정리한다. 발행 성공/실패로 포스트가 종결된 뒤에만 호출 — 그 전에 지우면
// 아직 진행 중인 익스텐션 발행이 이미지를 못 찾아 실패하게 됨.
// posts/{postId}/ 아래의 실제 발행용 이미지(uploadImagesToStorage 결과)는
// references/ 경로가 아니므로 이 함수가 건드리지 않는다.
async function cleanupReferenceImages(post) {
    try {
        const refUrl = post?.content_json?.reference_url || post?.reference_url;
        if (!refUrl) return;

        const bucketPrefix = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
        const paths = refUrl.split(',')
            .map(u => u.trim())
            .filter(u => u.includes(bucketPrefix) && u.includes('/references/'))
            .map(u => u.split(bucketPrefix)[1]);

        if (paths.length === 0) return;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        if (error) console.warn(`[Storage Cleanup] Failed to remove reference images: ${error.message}`);
        else console.log(`[Storage Cleanup] Removed ${paths.length} reference image(s) for post ${post.id}`);
    } catch (e) {
        console.warn(`[Storage Cleanup] Error: ${e.message}`);
    }
}

// M1+M2+M3 실행 (M4 Puppeteer 제외) → pending_extension 으로 상태 변경
// holdForApproval이 true면(텔레그램 오후 슬롯) pending_extension 대신 draft_pending_approval에서
// 멈춘다 — 확장프로그램은 pending_extension만 폴링하므로 이 상태는 자동 발행되지 않고
// 사용자가 텔레그램에서 승인해야 다음 단계로 넘어간다.
async function prepareForExtension(post, extension_device_id, holdForApproval = false) {
    const SmartIntake = require('./module1_intake');
    const ContentFactory = require('./module2_factory');
    const AssetManager = require('./module3_assets');

    let actualTopic = post.topic || 'AI 추천 주제';
    let keywordConfig = {};
    if (actualTopic.includes('|||')) {
        const parts = actualTopic.split('|||');
        actualTopic = parts[0];
        try { keywordConfig = JSON.parse(parts[1]); } catch (_) {}
    }

    const resolvedApiKey = post.profiles?.gemini_api_key || process.env.GEMINI_API_KEY || null;
    if (!resolvedApiKey) throw new Error('제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.');
    const preGenerated = post.content_json?._pre_generated;
    let content, dataAsset;
    // customPrompts.image_source(preGenerated=false 경로)와 이미지 생성 단계 양쪽에서 공통으로 씀
    const imageSourceExt = keywordConfig.image_source || post.content_json?.image_source || 'gemini';

    extLog('info', `[Extension Prepare] post=${post.id} preGenerated=${preGenerated} topic="${actualTopic.substring(0, 30)}"`);

    if (preGenerated) {
        await updateProgress(post.id, '원고 준비', '미리보기에서 생성한 원고를 재사용합니다...', 30, '약 2분 남음');
        content = {
            title: post.content_json.title,
            content: post.content_json.body || post.content_json.content,
            hashtags: post.content_json.hashtags,
            image_prompts: post.content_json.image_prompts,
            thumbnail_text: post.content_json.thumbnail_text || null,
            thumbnail_sub_text: post.content_json.thumbnail_sub_text || keywordConfig.thumbnail_text_config?.sub_text || null,
            thumbnail_style: post.content_json.thumbnail_style || 'bottom_bar',
            thumbnail_text_color: post.content_json.thumbnail_text_color || 'white',
            thumbnail_bg_type: post.content_json.thumbnail_bg_type || keywordConfig.thumbnail_text_config?.bg_type || 'image',
            thumbnail_bg_color: post.content_json.thumbnail_bg_color || keywordConfig.thumbnail_text_config?.bg_color || null,
        };
        dataAsset = post.content_json.data_asset || { target_keywords: { main: actualTopic } };
    } else {
        await updateProgress(post.id, '원고 준비', '확장 프로그램 발행을 위해 원고를 준비하고 있습니다...', 20, '약 4분 남음');
        await updateProgress(post.id, '데이터 분석', '키워드 데이터를 분석하고 있습니다...', 25, '약 4분 남음');
        const intake = new SmartIntake(resolvedApiKey);
        dataAsset = await intake.process(actualTopic, keywordConfig);

        await updateProgress(post.id, '원고 작성', 'AI 원고를 생성하고 있습니다...', 40, '약 3분 남음');
        const factory = new ContentFactory(resolvedApiKey);

        // customPrompts 구성 (executePipeline과 동일한 우선순위: 계정별 커스텀 프롬프트가 있으면
        // 그것을 그대로 쓰고, 없을 때만 카테고리별 prompt_vault로 폴백한다.
        // 예전엔 이 분기가 vault만 조회하고 계정의 custom_content_prompt/custom_image_prompt를
        // 전혀 안 읽어서, 크롬 확장 발행 경로에서는 "나의 프롬프트"/이미지 커스텀 프롬프트가
        // 반영되지 않는 문제가 있었다.
        let customPrompts = null;
        if (post.naver_accounts?.custom_content_prompt || post.naver_accounts?.custom_image_prompt || post.naver_accounts?.custom_thumbnail_prompt || post.naver_accounts?.custom_formatting_prompt) {
            customPrompts = {
                content_prompt: post.naver_accounts.custom_content_prompt,
                image_prompt: post.naver_accounts.custom_image_prompt,
                thumbnail_prompt: post.naver_accounts.custom_thumbnail_prompt,
                formatting_prompt: post.naver_accounts.custom_formatting_prompt,
            };
        }

        if (!customPrompts) {
            const { data: vaultPrompt } = await supabase
                .from('prompt_vault')
                .select('content_prompt, image_prompt, thumbnail_prompt')
                .eq('category', post.category || '일상')
                .eq('is_active', true)
                .single();
            if (vaultPrompt) customPrompts = vaultPrompt;
        }

        if (!customPrompts) customPrompts = {};
        if (keywordConfig.custom_instructions) customPrompts.custom_instructions = keywordConfig.custom_instructions;
        if (keywordConfig.seo_category) customPrompts.seo_category = keywordConfig.seo_category;
        if (keywordConfig.thumbnail_text_config) customPrompts.thumbnail_text_config = keywordConfig.thumbnail_text_config;

        customPrompts.image_source = imageSourceExt;

        content = await factory.generate(dataAsset, Object.keys(customPrompts).length ? customPrompts : null, post.content_json?._trigger_type || 'manual');
    }

    // 이미지 생성 — image_reference 타입일 때만 업로드된 미디어 재사용, 나머지는 AI 생성
    // url_reference의 기사 URL이 reference_url에 저장돼 있어도 이미지 경로로 오해하지 않도록 triggerType 체크
    const triggerType = post.content_json?._trigger_type || 'manual';
    const userRefUrls = triggerType === 'image_reference'
        ? (post.content_json?.reference_url || post.reference_url)
        : null;
    let assetReport = { images: [], image_count: 0 };
    let isGeminiImages = false;

    if (userRefUrls) {
        const parts = userRefUrls.split(',').map(u => u.trim()).filter(Boolean);
        assetReport.images = parts;
        assetReport.image_count = parts.length;
        await updateProgress(post.id, '이미지 준비', '업로드하신 미디어를 사용합니다.', 75, '잠시만 기다려주세요...');
    } else {
        await updateProgress(post.id, '이미지 생성', 'AI 이미지를 생성하고 있습니다...', 55, '약 2분 남음');
        const imageSourceExt = keywordConfig.image_source || post.content_json?.image_source || 'gemini';
        // 사용자가 미리 선택/업로드한 이미지가 있으면 이미지 소스 모드와 무관하게 항상 우선 사용
        const selectedPexelsImages = (post.content_json?.selected_pexels_images || []).filter(Boolean);
        isGeminiImages = imageSourceExt === 'gemini' && selectedPexelsImages.length === 0;
        const resolvedImagePathsExt = selectedPexelsImages.length > 0
            ? selectedPexelsImages
            : (dataAsset?.image_paths || []);
        const assets = new AssetManager(resolvedApiKey);
        assetReport = await assets.generateAll(
            content.image_prompts || [],
            dataAsset?.target_keywords?.main || actualTopic,
            content.title,
            {
                image_paths: resolvedImagePathsExt,
                triggerType: post.content_json?._trigger_type || 'manual',
                thumbnailText: content.thumbnail_text || null,
                thumbnailSubText: content.thumbnail_sub_text || null,
                thumbnailStyle: content.thumbnail_style || 'bottom_bar',
                thumbnailTextColor: content.thumbnail_text_color || 'white',
                thumbnailBgType: content.thumbnail_bg_type || 'image',
                thumbnailBgColor: content.thumbnail_bg_color || null,
                imageSource: imageSourceExt,
                customImagePrompt: post.naver_accounts?.custom_image_prompt || null,
                onProgress: async (current, total, prompt) => {
                    const percent = 55 + Math.floor((current / total) * 20);
                    await updateProgress(post.id, '이미지 생성', `이미지 준비 중 (${current}/${total} 완료)`, percent, `[${current}/${total}] ${prompt.substring(0, 20)}...`);
                }
            }
        );
    }

    // assetReport.images가 없으면 details에서 fullPath 추출 (module3 buildReport 구조 대응)
    // 실패(FAILED)한 이미지를 배열에서 제거(filter)하면 뒤 이미지들이 앞으로 당겨져
    // 본문의 [IMAGE_ANCHOR_N] 번호와 어긋나 버리므로, 실패한 자리는 null로 남겨 위치를 유지한다.
    // (uploadImagesToStorage와 익스텐션의 imageUrls 매핑은 null을 그대로 통과시켜 해당 앵커만 건너뜀)
    if (!assetReport.images && assetReport.details) {
        assetReport.images = assetReport.details
            .map(d => d.status === 'SUCCESS' ? d.path : null);
    }
    if (!assetReport.images && assetReport.file_list && assetReport.storage_path) {
        const pathMod = require('path');
        assetReport.images = assetReport.file_list.map(f => pathMod.join(assetReport.storage_path, f));
    }

    // 이미지를 Supabase Storage에 업로드 → 영구 HTTP URL 획득 (Railway 재배포 후에도 유효)
    await updateProgress(post.id, '이미지 업로드', '생성된 이미지를 저장하고 있습니다...', 78, '잠시만 기다려주세요...');
    const persistedImages = await uploadImagesToStorage(post.id, assetReport.images || []);
    // 에디터에서 직접 업로드한 이미지/동영상을 해당 [IMAGE_ANCHOR_N] 번호 자리에 병합.
    // custom_uploaded_images는 이미 Supabase Storage 공개 URL이라 재업로드가 필요 없고,
    // AI가 채운 자리(selected_pexels_images/AI 생성)와 순서가 섞이지 않도록 인덱스로만 덮어쓴다.
    (post.content_json?.custom_uploaded_images || []).forEach((url, idx) => {
        if (url) persistedImages[idx] = url;
    });
    extensionImageStore.set(post.id, persistedImages);
    // 24시간 후 자동 정리
    setTimeout(() => extensionImageStore.delete(post.id), 24 * 60 * 60 * 1000);

    // Business 데이터 구성 (extension은 URL 기반이므로 로컬 파일 경로 처리 생략)
    let business = {};
    if (post.naver_accounts) {
        const acc = post.naver_accounts;
        let mapAddr = keywordConfig.publish_options?.map_address || acc.biz_map_address;

        const footerComp = (acc.biz_footer_components || []).map(comp => {
            const c = { ...comp };
            if (c.type === 'MAP' && mapAddr) c.address = mapAddr;
            return c;
        });

        if (!mapAddr) {
            const mapComp = footerComp.find(c => c.type === 'MAP');
            if (mapComp) mapAddr = mapComp.address;
        }

        business = {
            phone: acc.biz_phone,
            kakao_id: acc.biz_kakao_id,
            kakao_url: acc.biz_kakao_url,
            map_address: mapAddr || null,
            cta_image_url: acc.biz_cta_image_url,
            footer_text: acc.biz_footer_text,
            image_links: acc.biz_image_links || {},
            footer_components: footerComp,
        };
        extLog('info', `[Extension Prepare] Business data: map=${mapAddr || 'none'}, footer_components=${footerComp.length}`);
    }

    // content_json 업데이트 및 pending_extension 상태로 전환
    const updatedContentJson = {
        ...(post.content_json || {}),
        title: content.title,
        content: content.content,
        hashtags: content.hashtags || [],
        image_prompts: content.image_prompts || [],
        thumbnail_text: content.thumbnail_text || null,
        thumbnail_sub_text: content.thumbnail_sub_text || null,
        extension_images: persistedImages,
        extension_image_count: persistedImages.length,
        ai_generated_indices: isGeminiImages
            ? persistedImages.map((_, i) => i)
            : content.thumbnail_text ? [0] : [],
        publish_options: {
            ...(keywordConfig.publish_options || {}),
            scheduled_at: post.scheduled_at || null,   // DB 컬럼 직접 반영
        },
        business,
    };

    await supabase.from('posts').update({
        status: holdForApproval ? 'draft_pending_approval' : 'pending_extension',
        content_json: updatedContentJson,
        ...(extension_device_id ? { extension_device_id } : {}),
    }).eq('id', post.id).in('status', ['pending', 'generating']);

    await updateProgress(post.id, '확장프로그램 대기', '확장 프로그램이 발행을 처리합니다. 크롬 브라우저에서 발행 중...', 80, '확장프로그램 처리 중...');
    extLog('info', `[Extension Prepare] ✅ Post ${post.id} ready. Images: ${(assetReport.images || []).length}, business.footer_components: ${business.footer_components?.length ?? 0}, scheduled_at: ${post.scheduled_at || 'none'}`);

    // 로컬 개발 환경 시 확장 프로그램 팝업 연결 없이도 80% 상태에서 멈추지 않고
    // 백엔드 Puppeteer가 직접 100% 자동 발행을 마무리하도록 자동 폴백 처리
    if (!holdForApproval) {
        extLog('info', `[Local Auto-Publish] Local environment auto-fallback triggered for post ${post.id}`);
        setTimeout(() => {
            postExecutionQueue.add(async () => {
                const { data: freshPost } = await supabase.from('posts').select('*, naver_accounts(*)').eq('id', post.id).single();
                if (freshPost && freshPost.status === 'pending_extension') {
                    console.log(`[Local Auto-Publish] Starting Puppeteer execution for post: ${freshPost.id}`);
                    await executePipeline(freshPost);
                }
            }).catch(err => console.error('[Local Auto-Publish Error]', err.message));
        }, 3000);
    }
}


// GET /api/extension/jobs — 해당 유저의 pending_extension 작업 목록
app.get('/api/extension/jobs', extensionAuthMiddleware, async (req, res) => {
    const deviceId = req.query.device_id || null;
    console.log('[Extension Jobs] user_id:', req.user.id, 'device_id:', deviceId || 'none');

    let query = supabase
        .from('posts')
        .select('id, topic, status, content_json, scheduled_at, created_at, extension_device_id, naver_accounts(naver_id)')
        .eq('user_id', req.user.id)
        .eq('status', 'pending_extension')
        .order('created_at', { ascending: true });

    // device_id가 있으면 해당 device 또는 device_id 미지정 job만 반환
    if (deviceId) {
        query = query.or(`extension_device_id.eq.${deviceId},extension_device_id.is.null`);
    }

    let { data, error } = await query;

    // device_id 조건으로 결과가 없으면 해당 유저의 모든 pending_extension 포스트 반환 (디바이스 ID 미스매치로 인한 80% 정체 방지)
    if (!error && (!data || data.length === 0) && deviceId) {
        const fallback = await supabase
            .from('posts')
            .select('id, topic, status, content_json, scheduled_at, created_at, extension_device_id, naver_accounts(naver_id)')
            .eq('user_id', req.user.id)
            .eq('status', 'pending_extension')
            .order('created_at', { ascending: true });
        if (fallback.data && fallback.data.length > 0) {
            console.log('[Extension Jobs] Fallback used due to device_id mismatch. Found jobs:', fallback.data.length);
            data = fallback.data;
        }
    }

    console.log('[Extension Jobs] result count:', data?.length, 'error:', error?.message);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ jobs: data || [] });
});

// POST /api/extension/jobs/:id/ack — 작업 시작 알림
app.post('/api/extension/jobs/:id/ack', extensionAuthMiddleware, async (req, res) => {
    await supabase.from('posts')
        .update({ status: 'posting' })  // generating 대신 posting 사용 (프론트 혼동 방지)
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);
    res.json({ status: 'acked' });
});

// POST /api/extension/jobs/:id/done — 작업 완료 보고
app.post('/api/extension/jobs/:id/done', extensionAuthMiddleware, async (req, res) => {
    const { success, url, error: jobError } = req.body;
    const { data: updatedPost } = await supabase.from('posts')
        .update({
            status: success ? 'success' : 'failed',
            naver_post_url: url || null,
            error_message: success ? null : (jobError || '확장 프로그램 발행 실패'),
            completed_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select('id, content_json, reference_url')
        .single();

    extensionImageStore.delete(req.params.id);
    if (updatedPost) cleanupReferenceImages(updatedPost).catch(() => {});
    res.json({ status: 'done' });
});

// POST /api/extension/jobs/:id/progress — 진행 상황 업데이트
app.post('/api/extension/jobs/:id/progress', extensionAuthMiddleware, async (req, res) => {
    const { step, detail } = req.body;
    await updateProgress(req.params.id, step || '발행 중', detail || '확장 프로그램이 발행하고 있습니다...', 85, '처리 중...');
    res.json({ ok: true });
});

// GET /api/extension/image/:postId/:index — 생성된 이미지 파일 제공 (확장 프로그램용)
app.get('/api/extension/image/:postId/:index', extensionAuthMiddleware, async (req, res) => {
    const { postId, index } = req.params;
    const idx = parseInt(index, 10);

    // DB에서 user_id 검증
    const { data: post } = await supabase.from('posts').select('user_id, content_json').eq('id', postId).single();
    if (!post || post.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // 메모리 저장소 또는 content_json에서 이미지 경로 조회
    let imagePaths = extensionImageStore.get(postId) || post.content_json?.extension_images || [];
    const imgPath = imagePaths[idx];

    if (!imgPath) return res.status(404).json({ error: 'Image not found' });

    if (!require('fs').existsSync(imgPath)) return res.status(404).json({ error: 'Image file missing' });

    const ext = require('path').extname(imgPath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    require('fs').createReadStream(imgPath).pipe(res);
});

// ════════════════════════════════════════
//  샤오홍슈 스크래핑 & 쿠팡 상품매칭
// ════════════════════════════════════════
const XHS_STORAGE_BUCKET = 'xhs-media';
let xhsBucketEnsured = false;
async function ensureXhsStorageBucket() {
    if (xhsBucketEnsured) return;
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets?.some(b => b.name === XHS_STORAGE_BUCKET)) {
            await supabase.storage.createBucket(XHS_STORAGE_BUCKET, { public: true });
        }
        xhsBucketEnsured = true;
    } catch (e) {
        console.warn('[XHS Storage] Bucket check/create failed:', e.message);
    }
}

// POST /api/xhs/jobs — 프론트엔드에서 샤오홍슈 URL 입력 시 job 생성 (x-engine-secret)
app.post('/api/xhs/jobs', authMiddleware, async (req, res) => {
    const { user_id, source_url } = req.body;
    if (!user_id || !source_url) return res.status(400).json({ error: 'user_id, source_url이 필요합니다.' });

    const { data, error } = await supabase
        .from('xhs_scrape_jobs')
        .insert({ user_id, source_url, status: 'pending_extension' })
        .select('id')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ job_id: data.id });
});

// GET /api/extension/xhs-jobs — 확장 프로그램 폴링용
app.get('/api/extension/xhs-jobs', extensionAuthMiddleware, async (req, res) => {
    const { data, error } = await supabase
        .from('xhs_scrape_jobs')
        .select('id, source_url, status, created_at')
        .eq('user_id', req.user.id)
        .eq('status', 'pending_extension')
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ jobs: data || [] });
});

// POST /api/extension/xhs-jobs/:id/ack — 스크래핑 시작 알림
app.post('/api/extension/xhs-jobs/:id/ack', extensionAuthMiddleware, async (req, res) => {
    await supabase.from('xhs_scrape_jobs')
        .update({ status: 'processing' })
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);
    res.json({ status: 'acked' });
});

// POST /api/extension/xhs-jobs/:id/upload — 확장이 스크래핑한 영상/이미지/캡션 업로드
app.post('/api/extension/xhs-jobs/:id/upload', extensionAuthMiddleware,
    xhsUpload.any(), async (req, res) => {
    const jobId = req.params.id;
    const { data: job } = await supabase.from('xhs_scrape_jobs').select('*').eq('id', jobId).eq('user_id', req.user.id).single();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    try {
        await ensureXhsStorageBucket();

        const videoFile = (req.files || []).find(f => f.fieldname === 'video');
        const imageFiles = (req.files || []).filter(f => f.fieldname.startsWith('image_'));

        let videoPath = req.body.video_url || null;
        if (videoFile) {
            const storagePath = `${jobId}/source.mp4`;
            const { error } = await supabase.storage.from(XHS_STORAGE_BUCKET)
                .upload(storagePath, videoFile.buffer, { contentType: 'video/mp4', upsert: true });
            if (error) throw new Error(`영상 업로드 실패: ${error.message}`);
            videoPath = supabase.storage.from(XHS_STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
        }

        const imagePaths = [];
        for (let i = 0; i < imageFiles.length; i++) {
            const storagePath = `${jobId}/image_${i}.jpg`;
            const { error } = await supabase.storage.from(XHS_STORAGE_BUCKET)
                .upload(storagePath, imageFiles[i].buffer, { contentType: 'image/jpeg', upsert: true });
            if (error) { console.warn(`[XHS] 이미지 ${i} 업로드 실패:`, error.message); continue; }
            imagePaths.push(supabase.storage.from(XHS_STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl);
        }

        await supabase.from('xhs_scrape_jobs').update({
            caption_text: req.body.caption_text || null,
            video_path: videoPath,
            image_paths: imagePaths,
            status: 'scraped',
        }).eq('id', jobId);

        res.json({ status: 'uploaded' });

        // video-engine 처리 트리거 (비동기, 응답을 막지 않음)
        const videoEngineUrl = process.env.VIDEO_ENGINE_URL || 'http://localhost:8001';
        axios.post(`${videoEngineUrl}/api/xhs/process`, {
            job_id: jobId,
            video_url: videoPath,
            image_urls: imagePaths,
            caption_text: req.body.caption_text || '',
            callback_url: `http://localhost:${process.env.ENGINE_PORT || 4000}/api/xhs/jobs/${jobId}/analyzed`,
            engine_secret: process.env.ENGINE_API_SECRET,
        }).catch(e => console.warn('[XHS] video-engine 트리거 실패:', e.message));

    } catch (e) {
        await supabase.from('xhs_scrape_jobs').update({ status: 'failed', error_message: e.message }).eq('id', jobId);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/extension/xhs-jobs/:id/done — 확장이 스크래핑 실패를 보고할 때만 사용
// (성공 시에는 /upload가 이미 status='scraped'로 갱신하므로 별도 처리 불필요)
app.post('/api/extension/xhs-jobs/:id/done', extensionAuthMiddleware, async (req, res) => {
    const { success, error: jobError } = req.body;
    if (!success) {
        await supabase.from('xhs_scrape_jobs')
            .update({ status: 'failed', error_message: jobError || '확장 프로그램 스크래핑 실패' })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);
    }
    res.json({ status: 'done' });
});

// POST /api/xhs/jobs/:id/analyzed — video-engine이 장면분할/번역/상품인식 완료 후 콜백 (x-engine-secret)
app.post('/api/xhs/jobs/:id/analyzed', authMiddleware, async (req, res) => {
    const jobId = req.params.id;
    const { scenes, translated_script, product_name_guess, error: analysisError } = req.body;

    if (analysisError) {
        await supabase.from('xhs_scrape_jobs')
            .update({ status: 'failed', error_message: analysisError })
            .eq('id', jobId);
        return res.json({ status: 'failed_recorded' });
    }

    const videoEngineUrl = process.env.VIDEO_ENGINE_URL || 'http://localhost:8001';
    const absoluteScenes = (scenes || []).map(s => ({
        ...s,
        thumbnail_path: s.thumbnail_path?.startsWith('http') ? s.thumbnail_path : `${videoEngineUrl}${s.thumbnail_path}`,
    }));

    await supabase.from('xhs_scrape_jobs').update({
        status: 'analyzing', scenes: absoluteScenes, translated_script, product_name_guess,
    }).eq('id', jobId);

    let coupangMatches = [];
    try {
        if (coupangApi.isConfigured() && product_name_guess) {
            coupangMatches = await coupangApi.searchProducts(product_name_guess, 10);
        }
    } catch (e) {
        console.warn('[XHS] Coupang 검색 실패:', e.message);
    }

    await supabase.from('xhs_scrape_jobs').update({
        status: 'ready', coupang_matches: coupangMatches, completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    res.json({ status: 'ready', matches: coupangMatches.length });
});

// ════════════════════════════════════════
//  Temp File Cleanup (3일 이상 된 파일 삭제)
// ════════════════════════════════════════
function cleanupTempFiles() {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deletedFiles = 0;
    let deletedDirs = 0;

    // 1) temp_uploads/ — 파일 단위 삭제
    const uploadDir = path.join(__dirname, 'temp_uploads');
    if (fs.existsSync(uploadDir)) {
        for (const file of fs.readdirSync(uploadDir)) {
            const filePath = path.join(uploadDir, file);
            try {
                const { mtimeMs } = fs.statSync(filePath);
                if (now - mtimeMs >= THREE_DAYS_MS) {
                    fs.unlinkSync(filePath);
                    deletedFiles++;
                }
            } catch (e) {
                console.warn(`[Cleanup] temp_uploads 파일 삭제 실패: ${file} — ${e.message}`);
            }
        }
    }

    // 2) tmp/blog_upload/ — 폴더 단위 삭제
    const blogUploadDir = path.join(__dirname, 'tmp', 'blog_upload');
    if (fs.existsSync(blogUploadDir)) {
        for (const dir of fs.readdirSync(blogUploadDir)) {
            const dirPath = path.join(blogUploadDir, dir);
            try {
                const stat = fs.statSync(dirPath);
                if (!stat.isDirectory()) return;
                if (now - stat.mtimeMs >= THREE_DAYS_MS) {
                    fs.rmSync(dirPath, { recursive: true, force: true });
                    deletedDirs++;
                }
            } catch (e) {
                console.warn(`[Cleanup] blog_upload 폴더 삭제 실패: ${dir} — ${e.message}`);
            }
        }
    }

    if (deletedFiles > 0 || deletedDirs > 0) {
        console.log(`[Cleanup] 완료 — temp_uploads: ${deletedFiles}개 파일, blog_upload: ${deletedDirs}개 폴더 삭제`);
    } else {
        console.log(`[Cleanup] 3일 이상 된 임시 파일 없음`);
    }
}

// Supabase Storage 정리 — 7일 이상 지난 발행 완료/실패 포스트 이미지 삭제
async function cleanupStorageImages() {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: oldPosts } = await supabase
            .from('posts')
            .select('id')
            .in('status', ['done', 'failed', 'published'])
            .lt('updated_at', sevenDaysAgo);

        if (!oldPosts || oldPosts.length === 0) {
            console.log('[Storage Cleanup] 삭제할 이미지 없음');
            return;
        }

        let deleted = 0;
        for (const post of oldPosts) {
            const folderPath = `posts/${post.id}`;
            const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(folderPath);
            if (!files || files.length === 0) continue;
            const filePaths = files.map(f => `${folderPath}/${f.name}`);
            const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
            if (!error) deleted += filePaths.length;
        }
        console.log(`[Storage Cleanup] ${oldPosts.length}개 포스트 이미지 ${deleted}개 삭제 완료`);
    } catch (e) {
        console.warn('[Storage Cleanup] 실패:', e.message);
    }
}

// ════════════════════════════════════════
//  POST /api/pexels/candidates — 이미지 슬롯별 Pexels 후보 조회
// ════════════════════════════════════════
app.post('/api/pexels/candidates', async (req, res) => {
    const { image_prompts, gemini_api_key } = req.body;
    if (!Array.isArray(image_prompts) || image_prompts.length === 0) {
        return res.status(400).json({ error: 'image_prompts 배열이 필요합니다.' });
    }

    const pexelsApiKey = process.env.PEXELS_API_KEY;
    if (!pexelsApiKey) {
        return res.status(500).json({ error: 'PEXELS_API_KEY가 설정되지 않았습니다.' });
    }

    // Gemini로 영어 프롬프트 → 한글 요약 일괄 번역
    const translateToKorean = async (prompts) => {
        if (!gemini_api_key) return prompts.map((_, i) => `${i + 1}번 이미지`);
        try {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(gemini_api_key.trim());
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
            const translatePrompt = `아래 영어 이미지 설명들을 각각 15자 이내의 간결한 한국어로 번역하세요. 번호와 번역문만 출력하고 다른 설명은 절대 쓰지 마세요.\n${prompts.map((p, i) => `${i + 1}. ${p.substring(0, 120)}`).join('\n')}`;
            const result = await model.generateContent(translatePrompt);
            const text = result.response.text().trim();
            const translations = [];
            for (const line of text.split('\n')) {
                const m = line.match(/^\d+[\.\)]\s*(.+)$/);
                if (m) translations.push(m[1].trim());
            }
            while (translations.length < prompts.length) translations.push(`${translations.length + 1}번 이미지`);
            return translations;
        } catch (e) {
            console.warn(`[Pexels] 한글 번역 실패: ${e.message}`);
            return prompts.map((_, i) => `${i + 1}번 이미지`);
        }
    };

    try {
        // Pexels 검색 + 한글 번역 병렬 실행
        const [koreanDescriptions, pexelsResults] = await Promise.all([
            translateToKorean(image_prompts),
            Promise.all(image_prompts.map(async (prompt, index) => {
                const query = prompt
                    .replace(/\(.*?\)/g, '')
                    .replace(/[^a-zA-Z0-9 ]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 60);

                try {
                    const response = await axios.get('https://api.pexels.com/v1/search', {
                        params: { query, per_page: 3, orientation: index === 0 ? 'square' : 'landscape' },
                        headers: { Authorization: pexelsApiKey },
                        timeout: 10000
                    });

                    const photos = (response.data.photos || []).map(p => ({
                        id: p.id,
                        url: index === 0 ? (p.src.large || p.src.medium) : (p.src.landscape || p.src.large),
                        thumbnail: p.src.medium,
                        photographer: p.photographer,
                        photographer_url: p.photographer_url
                    }));

                    return { index, query, photos };
                } catch (e) {
                    console.error(`[Pexels] 슬롯 ${index + 1} 검색 실패: ${e.message}`);
                    return { index, query: '', photos: [] };
                }
            }))
        ]);

        const candidates = pexelsResults.map((slot, i) => ({
            ...slot,
            korean_description: koreanDescriptions[i] || `${i + 1}번 이미지`
        }));

        res.json({ candidates });
    } catch (err) {
        console.error(`[Pexels] 전체 조회 오류: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════
//  PortOne 정기결제(빌링키) — 구독 시작/취소/웹훅
// ════════════════════════════════════════

// 구독 시작: 프론트에서 발급받은 빌링키를 서버가 재검증하고 첫 달 요금을 즉시 청구한다.
app.post('/api/billing/subscribe', authMiddleware, async (req, res) => {
    const { user_id, billing_key_id, plan_key } = req.body;
    if (!user_id || !billing_key_id) return res.status(400).json({ error: 'user_id, billing_key_id required' });

    const billing = require('./billing');
    const crypto = require('crypto');

    try {
        const verified = await billing.verifyBillingKey(billing_key_id);
        if (!verified) return res.status(400).json({ error: '빌링키 검증에 실패했습니다.' });

        // 가격은 절대 클라이언트가 보낸 값을 믿지 않고 서버에서 직접 결정한다.
        // - basic/pro: 자율 가입 — subscription_plans의 관리자 설정 가격을 그대로 청구, plan_type도 여기서 확정
        // - company: 자율 가입 불가 — 반드시 관리자가 사전에 profiles.plan_type='company' +
        //   override_price를 설정해둔 계정만 결제 가능(강제 결제 모달 전용 플로우). plan_type은 이미
        //   company이므로 변경하지 않는다.
        let amount;
        let newPlanType = null;

        if (plan_key === 'basic' || plan_key === 'pro') {
            const { data: planRow } = await supabase
                .from('subscription_plans').select('price').eq('plan_key', plan_key).maybeSingle();
            amount = planRow?.price || (plan_key === 'pro' ? parseInt(process.env.PORTONE_PRO_PLAN_PRICE, 10) : null);
            if (!amount) return res.status(500).json({ error: `${plan_key} 요금제 가격이 설정되지 않았습니다. 관리자 > 구독 관리에서 가격을 설정해주세요.` });
            newPlanType = plan_key;
        } else {
            const { data: profile } = await supabase
                .from('profiles').select('plan_type, override_price').eq('id', user_id).single();
            if (profile?.plan_type !== 'company') {
                return res.status(400).json({ error: '컴퍼니 요금제로 전환된 계정만 이 방식으로 결제할 수 있습니다.' });
            }
            amount = profile.override_price;
            if (!amount) return res.status(500).json({ error: '아직 결제 금액이 설정되지 않았습니다. 관리자에게 문의해주세요.' });
        }

        const paymentId = `sub_${user_id}_${Date.now()}`;
        const charge = await billing.chargeBillingKey({ billingKeyId: billing_key_id, paymentId, userId: user_id, amount });

        if (!charge.success) {
            await supabase.from('subscription_payments').insert({
                user_id, portone_payment_id: paymentId, amount, status: 'failed', failure_reason: charge.failureReason,
            });
            return res.status(402).json({ error: '결제에 실패했습니다: ' + charge.failureReason });
        }

        const currentPeriodEnd = new Date();
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

        const { data: subscription, error: subErr } = await supabase
            .from('subscriptions')
            .upsert({
                user_id,
                portone_billing_key_id: billing_key_id,
                status: 'active',
                current_period_end: currentPeriodEnd.toISOString(),
                canceled_at: null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
            .select()
            .single();
        if (subErr) console.error('[Billing] subscriptions upsert 실패:', subErr.message);

        await supabase.from('subscription_payments').insert({
            user_id, subscription_id: subscription?.id || null, portone_payment_id: paymentId,
            portone_transaction_id: null, amount, status: 'paid',
        });

        if (newPlanType) {
            await supabase.from('profiles').update({ plan_type: newPlanType }).eq('id', user_id);
        }

        console.log(`[Billing] 구독 시작 성공: user=${user_id}, paymentId=${paymentId}`);
        res.json({ status: 'active', current_period_end: currentPeriodEnd.toISOString() });
    } catch (err) {
        console.error('[Billing] subscribe 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 구독 취소: 이미 낸 기간(current_period_end)까지는 PRO 유지, 그 이후 스케줄러가 자동 강등.
app.post('/api/billing/cancel', authMiddleware, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    try {
        const { error } = await supabase
            .from('subscriptions')
            .update({ status: 'canceled', canceled_at: new Date().toISOString() })
            .eq('user_id', user_id)
            .eq('status', 'active');
        if (error) return res.status(500).json({ error: error.message });

        console.log(`[Billing] 구독 취소: user=${user_id}`);
        res.json({ status: 'canceled' });
    } catch (err) {
        console.error('[Billing] cancel 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PortOne이 직접 호출하는 웹훅 — x-engine-secret이 아니라 PortOne 서명으로 검증한다.
// 동기 응답(구독 시작/스케줄러 청구)과 같은 결제 건을 중복 기록하지 않도록
// portone_transaction_id UNIQUE 제약 + upsert(onConflict)로 dedupe.
app.post('/api/billing/webhook', async (req, res) => {
    try {
        const { Webhook } = require('@portone/server-sdk');
        const webhook = await Webhook.verify(process.env.PORTONE_WEBHOOK_SECRET, req.rawBody, req.headers);

        if (webhook.type === 'Transaction.Paid' || webhook.type === 'Transaction.Failed') {
            const { paymentId, transactionId } = webhook.data;
            // paymentId는 우리가 sub_${user_id}_${ts} 형식으로 생성했으므로 여기서 user_id를 복원
            const match = paymentId.match(/^sub_(.+)_\d+$/);
            const userId = match?.[1];
            if (!userId) {
                console.warn(`[Billing Webhook] paymentId 형식이 예상과 다름: ${paymentId}`);
                return res.status(200).end();
            }

            if (webhook.type === 'Transaction.Paid') {
                await supabase.from('subscription_payments')
                    .update({ portone_transaction_id: transactionId })
                    .eq('portone_payment_id', paymentId)
                    .eq('status', 'paid');
            } else {
                await supabase.from('subscriptions').update({ status: 'past_due' }).eq('user_id', userId);
                await supabase.from('profiles').update({ plan_type: 'free' }).eq('id', userId);
            }
        }

        res.status(200).end();
    } catch (err) {
        const { Webhook } = require('@portone/server-sdk');
        if (err instanceof Webhook.WebhookVerificationError) {
            console.warn('[Billing Webhook] 서명 검증 실패:', err.message);
            return res.status(400).end();
        }
        console.error('[Billing Webhook] 처리 오류:', err.message);
        res.status(500).end();
    }
});

/**
 * 텔레그램 딥링크(/start <code>)로 받은 인증코드를 telegram_link_codes와 매칭해
 * profiles.telegram_chat_id를 채운다. 실패 케이스별로 다른 안내 메시지를 보낸다.
 */
async function handleTelegramStart(message) {
    const telegramBot = require('./telegram_bot');
    const chatId = message.chat.id;
    const code = message.text.split(' ')[1]?.trim();

    if (!code) {
        await telegramBot.sendMessage(chatId, '잘못된 링크입니다. 설정 페이지에서 다시 연동을 시도해주세요.');
        return;
    }

    const { data: row, error } = await supabase
        .from('telegram_link_codes')
        .select('user_id, expires_at, used_at')
        .eq('code', code)
        .maybeSingle();

    if (error) {
        console.error('[Telegram Webhook] 인증코드 조회 오류:', error.message);
        await telegramBot.sendMessage(chatId, '연동 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    if (!row) {
        await telegramBot.sendMessage(chatId, '유효하지 않은 인증 코드입니다. 설정 페이지에서 다시 시도해주세요.');
        return;
    }
    if (row.used_at) {
        await telegramBot.sendMessage(chatId, '이미 사용된 코드입니다. 설정 페이지에서 다시 시도해주세요.');
        return;
    }
    if (new Date(row.expires_at) < new Date()) {
        await telegramBot.sendMessage(chatId, '인증 코드가 만료되었습니다. 설정 페이지에서 다시 시도해주세요.');
        return;
    }

    const { error: updateErr } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: chatId })
        .eq('id', row.user_id);

    if (updateErr) {
        // telegram_chat_id 부분 유니크 인덱스 위반 = 이 텔레그램 계정이 이미 다른 회원에 연동됨
        if (updateErr.code === '23505') {
            await telegramBot.sendMessage(chatId, '이 텔레그램 계정은 이미 다른 계정에 연동되어 있습니다.');
        } else {
            console.error('[Telegram Webhook] profiles 업데이트 오류:', updateErr.message);
            await telegramBot.sendMessage(chatId, '연동 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }
        return;
    }

    await supabase.from('telegram_link_codes').update({ used_at: new Date().toISOString() }).eq('code', code);
    await telegramBot.sendMessage(chatId, '✅ 텔레그램 연동이 완료되었습니다!');
}

/**
 * 예/아니오 인라인 버튼 클릭 처리. callback_data는 "suggest:<post_id>:yes|no" 또는
 * "draft:<post_id>:yes|no" 형식 (scheduler.js의 runSuggestSlot/runDraftApprovalSlot이 발급).
 * 슬롯 개수는 사용자마다 다를 수 있지만, 응답 처리는 mode(suggest/draft_approval)에만 좌우된다.
 */
async function handleTelegramCallback(callbackQuery) {
    const telegramBot = require('./telegram_bot');
    // 응답 안 하면 사용자 화면에서 버튼 로딩 스피너가 계속 돎 — 항상 먼저 호출
    await telegramBot.answerCallbackQuery(callbackQuery.id);

    const chatId = callbackQuery.message?.chat?.id;
    if (!chatId) return;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .maybeSingle();

    if (error) {
        console.error('[Telegram Webhook] 사용자 조회 오류:', error.message);
        return;
    }
    if (!profile) {
        console.warn(`[Telegram Webhook] 연동되지 않은 chat_id로부터 콜백 수신: ${chatId}`);
        return;
    }

    await handleTelegramUserResponse(profile.id, chatId, callbackQuery.data);
}

async function handleTelegramUserResponse(userId, chatId, callbackData) {
    const parts = String(callbackData).split(':'); // suggest:<post_id>:yes|no 등, 항상 3개 세그먼트
    if (parts.length !== 3) return;
    const [mode, a, b] = parts;
    if (mode === 'suggest') return handleSuggestCallback(userId, chatId, a, b);
    if (mode === 'draft') return handleDraftApprovalCallback(userId, chatId, a, b);
    if (mode === 'menu') return handleMenuCallback(userId, chatId, a, b);            // a=post_id, b=instant|customize
    if (mode === 'confirm') return handleInstantConfirmCallback(userId, chatId, a, b); // a=post_id, b=yes|no
    if (mode === 'wz') return handleWizardCallback(userId, chatId, a, b);            // a=step종류, b=값
}

/**
 * "제안형" 슬롯 응답 처리. "아니오"는 바로 취소. "예"는 더 이상 곧바로 생성하지 않고
 * [즉시발행/발행설정] 메뉴를 보여준다 (실제 생성은 handleInstantConfirmCallback/handleWizardConfirm에서).
 * 상태를 telegram_suggested일 때만 조건부로 바꿔서(CAS), 같은 버튼을 두 번 누르거나
 * 텔레그램이 같은 업데이트를 재전송해도 두 번째는 아무 일도 안 일어나게 한다.
 */
async function handleSuggestCallback(userId, chatId, postId, answer) {
    const telegramBot = require('./telegram_bot');

    if (answer === 'no') {
        const { data, error } = await supabase.from('posts')
            .update({ status: 'cancelled' })
            .eq('id', postId).eq('user_id', userId).eq('status', 'telegram_suggested')
            .select('id');
        if (error) { console.error(`[Telegram] suggest CAS 실패: ${error.message}`); return; }
        await telegramBot.sendMessage(chatId, data?.length ? '취소되었습니다.' : '이미 처리된 요청입니다.');
        return;
    }

    const { data: post } = await supabase.from('posts')
        .select('id, status').eq('id', postId).eq('user_id', userId).maybeSingle();
    if (post?.status !== 'telegram_suggested') {
        await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.');
        return;
    }
    await telegramBot.sendMessageWithButtons(chatId, '어떻게 진행할까요?', [
        { text: '⚡ 즉시발행', callback_data: `menu:${postId}:instant` },
        { text: '⚙️ 발행설정', callback_data: `menu:${postId}:customize` },
    ]);
}

/**
 * "완성형" 슬롯 응답 처리. "아니오"는 바로 취소. "예"는 마찬가지로 곧바로 발행하지 않고
 * [즉시발행/발행설정] 메뉴를 보여준다 — 즉시발행을 고르면 이미 써둔 원고를 그대로 발행하고,
 * 발행설정을 고르면 이미 써둔 원고를 버리고 새 설정으로 다시 생성한다.
 */
async function handleDraftApprovalCallback(userId, chatId, postId, answer) {
    const telegramBot = require('./telegram_bot');

    if (answer === 'no') {
        const { data, error } = await supabase.from('posts')
            .update({ status: 'cancelled' })
            .eq('id', postId).eq('user_id', userId).eq('status', 'draft_pending_approval')
            .select('id');
        if (error) { console.error(`[Telegram] draft CAS 실패: ${error.message}`); return; }
        await telegramBot.sendMessage(chatId, data?.length ? '취소되었습니다.' : '이미 처리된 요청입니다.');
        return;
    }

    const { data: post } = await supabase.from('posts')
        .select('id, status').eq('id', postId).eq('user_id', userId).maybeSingle();
    if (post?.status !== 'draft_pending_approval') {
        await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.');
        return;
    }
    await telegramBot.sendMessageWithButtons(chatId, '어떻게 진행할까요?', [
        { text: '⚡ 즉시발행', callback_data: `menu:${postId}:instant` },
        { text: '⚙️ 발행설정', callback_data: `menu:${postId}:customize` },
    ]);
}

/**
 * [즉시발행/발행설정] 메뉴 선택 처리. 즉시발행은 확인 메시지만 보여주고(실제 커밋은
 * handleInstantConfirmCallback), 발행설정은 telegram_conversations에 위저드 상태를 만들고
 * 첫 질문(톤)을 보낸다.
 */
async function handleMenuCallback(userId, chatId, postId, choice) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');

    const { data: post } = await supabase.from('posts')
        .select('id, status, topic, naver_account_id').eq('id', postId).eq('user_id', userId).maybeSingle();
    if (!post || !['telegram_suggested', 'draft_pending_approval'].includes(post.status)) {
        await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.');
        return;
    }
    const mainKeyword = (post.topic || '').split('|||')[0];

    if (choice === 'instant') {
        const text = post.status === 'telegram_suggested'
            ? `'${mainKeyword}'로 발행하겠습니다.`
            : '이미 작성된 원고를 그대로 발행하겠습니다.';
        await telegramBot.sendMessageWithButtons(chatId, text, [
            { text: '확인', callback_data: `confirm:${postId}:yes` },
            { text: '취소', callback_data: `confirm:${postId}:no` },
        ]);
        return;
    }

    // customize: chat_id가 PK라 이 채팅에 남아있던 미완료 위저드(다른 글에 대한 것 포함)는 덮어써진다.
    // 원래 추천된 키워드는 여기서 answers.main_keyword로 미리 넣어둬서, 이후 "그대로 사용"을
    // 고르든 "수정하기"로 새로 입력하든 handleWizardCallback/handleTelegramFreeText 쪽에서
    // posts.topic을 다시 조회할 필요가 없게 한다.
    await supabase.from('telegram_conversations').upsert({
        chat_id: chatId, user_id: userId, post_id: postId, naver_account_id: post.naver_account_id,
        step: 'keyword_confirm', answers: { main_keyword: mainKeyword }, wizard_cache: {},
        updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

    await telegramBot.sendMessageWithButtons(chatId, `현재 키워드: '${mainKeyword}'\n이대로 진행할까요?`, [
        { text: '그대로 사용', callback_data: 'wz:kw:keep' },
        { text: '수정하기', callback_data: 'wz:kw:edit' },
    ]);
}

/**
 * 세부요청사항까지 끝나면, 네이버카테고리 질문으로 바로 들어가기 전에 "이전 발행 설정과
 * 동일하게 하시겠어요?"를 먼저 물어본다. 이전 성공 발행 글에 publish_options가 없으면
 * (이전 발행 이력이 아예 없거나, 있어도 옛날 방식으로 만들어진 글) 이 확인 자체를 건너뛰고
 * 바로 네이버카테고리 질문으로 넘어간다.
 */
async function advanceToReuseCheckStep(chatId, conv, answers) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');
    const prior = await wizard.resolveLastPublishOptions(supabase, conv.naver_account_id);

    if (!prior) {
        await advanceToNaverCategoryStep(chatId, conv, answers);
        return;
    }

    await supabase.from('telegram_conversations')
        .update({
            answers, step: 'reuse_prior_confirm', wizard_cache: { prior_publish_options: prior },
            updated_at: new Date().toISOString(),
        })
        .eq('chat_id', chatId);

    const visOption = wizard.TELEGRAM_VISIBILITY_OPTIONS.find(v => v.value === prior.visibility);
    const text = `발행 설정을 이전 발행과 동일하게 설정하시겠어요?\n` +
        `네이버 블로그 카테고리: ${prior.naver_category_name || '선택 안 함'}\n` +
        `글주제: ${prior.topic_id && prior.topic_id !== '0' ? prior.topic_id : '선택 안 함'}\n` +
        `공개설정: ${visOption?.label || prior.visibility}\n` +
        `지도: ${prior.use_map ? prior.map_address : '사용 안 함'}`;

    await telegramBot.sendMessageWithButtons(chatId, text, [
        { text: '예', callback_data: 'wz:reuse:yes' },
        { text: '아니오', callback_data: 'wz:reuse:no' },
    ]);
}

/**
 * 세부요청사항까지 끝나면 네이버 블로그의 실제 카테고리 목록을 조회해서 물어본다
 * (AI 템플릿 카테고리와는 별개 — 실시간 스크래핑이라 몇 초 걸릴 수 있어 안내 메시지를 먼저 보낸다).
 * 조회 실패/빈 목록이면 건너뛰고 바로 글주제 단계로 넘어간다.
 */
async function advanceToNaverCategoryStep(chatId, conv, answers) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');
    await telegramBot.sendMessage(chatId, '네이버 블로그 카테고리를 조회하고 있어요...');

    let categories = [];
    try {
        const port = process.env.PORT || process.env.ENGINE_PORT || 4000;
        const res = await fetch(`http://localhost:${port}/api/accounts/${conv.naver_account_id}/categories`, {
            headers: { 'x-engine-secret': process.env.ENGINE_API_SECRET },
        });
        const json = await res.json();
        categories = json?.categories || [];
    } catch (err) {
        console.error(`[Telegram] 네이버 카테고리 조회 실패: ${err.message}`);
    }

    if (!categories.length) {
        await supabase.from('telegram_conversations')
            .update({
                answers: { ...answers, naver_category_id: '', naver_category_name: '' },
                step: 'topic_group', updated_at: new Date().toISOString(),
            })
            .eq('chat_id', chatId);
        await telegramBot.sendMessage(chatId, '카테고리를 불러오지 못했어요. 건너뛸게요.');
        await telegramBot.sendMessageWithButtonRows(chatId, '글주제를 선택해주세요', wizard.buildTopicGroupRows());
        return;
    }

    await supabase.from('telegram_conversations')
        .update({
            answers, step: 'naver_category', wizard_cache: { naver_categories: categories },
            updated_at: new Date().toISOString(),
        })
        .eq('chat_id', chatId);
    await telegramBot.sendMessageWithButtonRows(chatId, '네이버 블로그 카테고리를 선택해주세요', wizard.buildNaverCategoryRows(categories));
}

/**
 * 즉시발행 확인/취소 처리. 확인이면 (제안형인 경우) 마지막 성공 발행 설정을 복원해서
 * topic/category/content_json을 채운 뒤 생성을 시작하고, (완성형인 경우) 이미 써둔 원고를
 * 그대로 발행 큐에 올린다. 취소면 어느 쪽이든 글을 cancelled로 종결한다 — 안 그러면 사용자가
 * 여기서 그만두면 그 글이 아무 후속 안내도 없이 telegram_suggested/draft_pending_approval에
 * 영원히 갇히기 때문.
 */
async function handleInstantConfirmCallback(userId, chatId, postId, answer) {
    const telegramBot = require('./telegram_bot');

    if (answer === 'no') {
        const { data, error } = await supabase.from('posts')
            .update({ status: 'cancelled' })
            .eq('id', postId).eq('user_id', userId)
            .in('status', ['telegram_suggested', 'draft_pending_approval'])
            .select('id');
        if (error) { console.error(`[Telegram] instant confirm CAS 실패: ${error.message}`); return; }
        await telegramBot.sendMessage(chatId, data?.length ? '취소되었습니다.' : '이미 처리된 요청입니다.');
        return;
    }

    const { data: post } = await supabase.from('posts')
        .select('id, status, topic, naver_account_id').eq('id', postId).eq('user_id', userId).maybeSingle();

    if (post?.status === 'telegram_suggested') {
        const wizard = require('./telegram_wizard');
        const resolved = await wizard.resolveLastSuccessSettings(supabase, post.naver_account_id, userId);
        const mainKeyword = (post.topic || '').split('|||')[0];
        const newTopic = `${mainKeyword}|||${JSON.stringify({
            main_keyword: mainKeyword, seo_category: resolved.tone,
            custom_instructions: resolved.customInstructions, image_source: resolved.imageSource,
        })}`;

        const { data, error } = await supabase.from('posts')
            .update({
                status: 'generating', topic: newTopic, category: resolved.category,
                content_json: { _trigger_type: 'manual', image_source: resolved.imageSource },
            })
            .eq('id', postId).eq('user_id', userId).eq('status', 'telegram_suggested')
            .select('id');
        if (error) { console.error(`[Telegram] instant CAS 실패: ${error.message}`); return; }
        if (!data?.length) { await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.'); return; }

        await telegramBot.sendMessage(chatId, '알겠습니다! 원고를 생성해서 발행 큐에 올릴게요.');
        const port = process.env.PORT || process.env.ENGINE_PORT || 4000;
        fetch(`http://localhost:${port}/api/extension/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-engine-secret': process.env.ENGINE_API_SECRET },
            body: JSON.stringify({ post_id: postId }),
        }).catch(err => console.error(`[Telegram] instant prepare 호출 실패: ${err.message}`));
        return;
    }

    if (post?.status === 'draft_pending_approval') {
        const { data, error } = await supabase.from('posts')
            .update({ status: 'pending_extension' })
            .eq('id', postId).eq('user_id', userId).eq('status', 'draft_pending_approval')
            .select('id');
        if (error) { console.error(`[Telegram] instant(draft) CAS 실패: ${error.message}`); return; }
        await telegramBot.sendMessage(chatId, data?.length ? '발행 큐에 등록했습니다!' : '이미 처리된 요청입니다.');
        return;
    }

    await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.');
}

/**
 * "발행설정" 위저드의 버튼형 단계(톤/이미지방식/카테고리/프리셋선택/최종확인) 처리.
 * 위저드 상태는 telegram_conversations에 chat_id 기준으로 저장돼 있어서, 버튼 자체에는
 * post_id 없이 짧은 값만 들어있다.
 */
async function handleWizardCallback(userId, chatId, wzType, value) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');

    const { data: conv } = await supabase.from('telegram_conversations')
        .select('*').eq('chat_id', chatId).maybeSingle();
    if (!conv || conv.user_id !== userId) return; // 활성 위저드 없음 — 조용히 무시

    const expectedStep = {
        kw: 'keyword_confirm', subkw: 'sub_keywords',
        tone: 'tone', img: 'image', cat: 'category', preset: 'instructions',
        reuse: 'reuse_prior_confirm',
        navcat: 'naver_category', topicgrp: 'topic_group', topic: 'topic_pick',
        vis: 'visibility', map: 'map_use', sched: 'schedule_type',
        confirm: 'confirm',
    }[wzType];
    if (!expectedStep || conv.step !== expectedStep) {
        await telegramBot.sendMessage(chatId, '이미 지난 단계입니다. 다시 "발행설정"부터 시작해주세요.');
        return;
    }

    if (wzType === 'kw') {
        if (value === 'keep') {
            await supabase.from('telegram_conversations')
                .update({ step: 'sub_keywords', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessageWithButtons(chatId, '서브 키워드가 있다면 쉼표로 구분해서 입력해주세요 (없으면 건너뛰기)', [
                { text: '건너뛰기', callback_data: 'wz:subkw:skip' },
            ]);
            return;
        }
        if (value === 'edit') {
            await supabase.from('telegram_conversations')
                .update({ step: 'keyword_text', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessage(chatId, '새 키워드를 입력해주세요');
            return;
        }
        return;
    }

    if (wzType === 'subkw') {
        if (value !== 'skip') return;
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, sub_keywords: '' }, step: 'tone', updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtonRows(chatId, '말투를 선택해주세요', wizard.buildToneRows());
        return;
    }

    if (wzType === 'tone') {
        const tone = wizard.TELEGRAM_TONE_OPTIONS[Number(value)];
        if (!tone) return;
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, tone }, step: 'image', updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtons(chatId, '이미지 생성 방식을 선택해주세요', [
            { text: 'AI 이미지 생성', callback_data: 'wz:img:gemini' },
            { text: '무료 이미지', callback_data: 'wz:img:stock' },
        ]);
        return;
    }

    if (wzType === 'img') {
        if (!['gemini', 'stock'].includes(value)) return;
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, image_source: value }, step: 'category', updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtonRows(chatId, '카테고리를 선택해주세요', wizard.buildCategoryRows());
        return;
    }

    if (wzType === 'cat') {
        const category = wizard.TELEGRAM_CATEGORY_OPTIONS[Number(value)];
        if (!category) return;
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, category }, step: 'instructions', updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);

        const { data: presets } = await supabase.from('custom_instruction_presets')
            .select('id, content').eq('naver_account_id', conv.naver_account_id)
            .order('created_at', { ascending: false }).limit(8);
        await telegramBot.sendMessageWithButtonRows(chatId, '세부 요청사항을 선택해주세요', wizard.buildPresetRows(presets || []));
        return;
    }

    if (wzType === 'preset') {
        if (value === 'custom') {
            await supabase.from('telegram_conversations')
                .update({ step: 'instructions_custom_text', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessage(chatId, '세부 요청사항을 입력해주세요');
            return;
        }
        // 프리셋은 이 위저드가 시작될 때 저장해둔 naver_account_id 소유 것만 조회 — 다른 계정 프리셋 id를
        // 조작해서 넣어도 조회가 안 되게 방어.
        const { data: preset } = await supabase.from('custom_instruction_presets')
            .select('content').eq('id', value).eq('naver_account_id', conv.naver_account_id).maybeSingle();
        const answers = { ...conv.answers, custom_instructions: preset?.content || '' };
        await advanceToReuseCheckStep(chatId, conv, answers);
        return;
    }

    if (wzType === 'reuse') {
        if (value === 'yes') {
            const prior = conv.wizard_cache?.prior_publish_options || {};
            const answers = { ...conv.answers, ...prior };
            await supabase.from('telegram_conversations')
                .update({ answers, step: 'schedule_type', wizard_cache: {}, updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessageWithButtons(chatId, '발행 시점을 선택해주세요', [
                { text: '즉시 발행', callback_data: 'wz:sched:now' },
                { text: '예약 발행', callback_data: 'wz:sched:later' },
            ]);
            return;
        }
        if (value === 'no') {
            await advanceToNaverCategoryStep(chatId, conv, conv.answers);
            return;
        }
        return;
    }

    if (wzType === 'navcat') {
        let answers;
        if (value === 'skip') {
            answers = { ...conv.answers, naver_category_id: '', naver_category_name: '' };
        } else {
            const categories = conv.wizard_cache?.naver_categories || [];
            const picked = categories[Number(value)];
            if (!picked) return;
            answers = { ...conv.answers, naver_category_id: picked.id, naver_category_name: picked.name };
        }
        await supabase.from('telegram_conversations')
            .update({ answers, step: 'topic_group', wizard_cache: {}, updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtonRows(chatId, '글주제를 선택해주세요', wizard.buildTopicGroupRows());
        return;
    }

    if (wzType === 'topicgrp') {
        if (value === 'skip') {
            await supabase.from('telegram_conversations')
                .update({ answers: { ...conv.answers, topic_id: '0' }, step: 'visibility', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessageWithButtonRows(chatId, '공개 설정을 선택해주세요', wizard.buildVisibilityRows());
            return;
        }
        const groupIdx = Number(value);
        if (!wizard.TELEGRAM_TOPIC_GROUPS[groupIdx]) return;
        await supabase.from('telegram_conversations')
            .update({ step: 'topic_pick', wizard_cache: { topic_group_idx: groupIdx }, updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtonRows(chatId, '세부 글주제를 선택해주세요', wizard.buildTopicRows(groupIdx));
        return;
    }

    if (wzType === 'topic') {
        const groupIdx = conv.wizard_cache?.topic_group_idx;
        const topics = wizard.TELEGRAM_TOPIC_GROUPS[groupIdx]?.topics || [];
        const topicId = topics[Number(value)];
        if (!topicId) return;
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, topic_id: topicId }, step: 'visibility', wizard_cache: {}, updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtonRows(chatId, '공개 설정을 선택해주세요', wizard.buildVisibilityRows());
        return;
    }

    if (wzType === 'vis') {
        const opt = wizard.TELEGRAM_VISIBILITY_OPTIONS[Number(value)];
        if (!opt) return;
        const perms = wizard.TELEGRAM_VISIBILITY_PERMISSIONS[opt.value];
        await supabase.from('telegram_conversations')
            .update({ answers: { ...conv.answers, visibility: opt.value, ...perms }, step: 'map_use', updated_at: new Date().toISOString() })
            .eq('chat_id', chatId);
        await telegramBot.sendMessageWithButtons(chatId, '지도를 사용하시겠어요?', [
            { text: '사용', callback_data: 'wz:map:yes' },
            { text: '사용 안 함', callback_data: 'wz:map:no' },
        ]);
        return;
    }

    if (wzType === 'map') {
        if (value === 'no') {
            await supabase.from('telegram_conversations')
                .update({ answers: { ...conv.answers, use_map: false, map_address: '' }, step: 'schedule_type', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessageWithButtons(chatId, '발행 시점을 선택해주세요', [
                { text: '즉시 발행', callback_data: 'wz:sched:now' },
                { text: '예약 발행', callback_data: 'wz:sched:later' },
            ]);
            return;
        }
        if (value === 'yes') {
            await supabase.from('telegram_conversations')
                .update({ step: 'map_address_text', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessage(chatId, '지도에 표시할 주소를 입력해주세요');
            return;
        }
        return;
    }

    if (wzType === 'sched') {
        if (value === 'now') {
            const answers = { ...conv.answers, schedule_type: 'now' };
            await supabase.from('telegram_conversations')
                .update({ answers, step: 'confirm', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await sendWizardSummary(chatId, answers);
            return;
        }
        if (value === 'later') {
            await supabase.from('telegram_conversations')
                .update({ answers: { ...conv.answers, schedule_type: 'scheduled' }, step: 'schedule_datetime_text', updated_at: new Date().toISOString() })
                .eq('chat_id', chatId);
            await telegramBot.sendMessage(chatId, '발행 시각을 "YYYY-MM-DD HH:MM" 형식으로 입력해주세요 (예: 2026-07-25 14:30)');
            return;
        }
        return;
    }

    if (wzType === 'confirm') {
        await handleWizardConfirm(userId, chatId, conv, value);
    }
}

/**
 * 위저드 도중 자유 텍스트로 답해야 하는 단계들(키워드 수정/서브키워드/세부요청사항 직접입력/
 * 지도주소/예약시각) 처리. telegram_conversations에 해당 chat_id의 활성 위저드가 없거나
 * 지금 단계가 텍스트를 기대하지 않으면 조용히 무시한다 — 활성 위저드가 없는 사용자에게는
 * 기존 "일반 텍스트 무시" 동작을 그대로 유지하기 위함.
 */
async function handleTelegramFreeText(message) {
    const chatId = message.chat.id;
    const text = message.text?.trim();
    if (!text) return;

    const { data: conv } = await supabase.from('telegram_conversations')
        .select('*').eq('chat_id', chatId).maybeSingle();
    if (!conv) return;

    const handlers = {
        keyword_text: handleKeywordTextStep,
        sub_keywords: handleSubKeywordsTextStep,
        instructions_custom_text: handleInstructionsCustomTextStep,
        map_address_text: handleMapAddressTextStep,
        schedule_datetime_text: handleScheduleDatetimeTextStep,
    };
    const handler = handlers[conv.step];
    if (!handler) return; // 이 단계는 텍스트를 기대하지 않음 — 조용히 무시
    await handler(conv, chatId, text);
}

async function handleKeywordTextStep(conv, chatId, text) {
    const telegramBot = require('./telegram_bot');
    const answers = { ...conv.answers, main_keyword: text };
    await supabase.from('telegram_conversations')
        .update({ answers, step: 'sub_keywords', updated_at: new Date().toISOString() })
        .eq('chat_id', chatId);
    await telegramBot.sendMessageWithButtons(chatId, '서브 키워드가 있다면 쉼표로 구분해서 입력해주세요 (없으면 건너뛰기)', [
        { text: '건너뛰기', callback_data: 'wz:subkw:skip' },
    ]);
}

async function handleSubKeywordsTextStep(conv, chatId, text) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');
    const answers = { ...conv.answers, sub_keywords: text };
    await supabase.from('telegram_conversations')
        .update({ answers, step: 'tone', updated_at: new Date().toISOString() })
        .eq('chat_id', chatId);
    await telegramBot.sendMessageWithButtonRows(chatId, '말투를 선택해주세요', wizard.buildToneRows());
}

async function handleInstructionsCustomTextStep(conv, chatId, text) {
    const answers = { ...conv.answers, custom_instructions: text };
    await advanceToReuseCheckStep(chatId, conv, answers);
}

async function handleMapAddressTextStep(conv, chatId, text) {
    const telegramBot = require('./telegram_bot');
    const answers = { ...conv.answers, map_address: text };
    await supabase.from('telegram_conversations')
        .update({ answers, step: 'schedule_type', updated_at: new Date().toISOString() })
        .eq('chat_id', chatId);
    await telegramBot.sendMessageWithButtons(chatId, '발행 시점을 선택해주세요', [
        { text: '즉시 발행', callback_data: 'wz:sched:now' },
        { text: '예약 발행', callback_data: 'wz:sched:later' },
    ]);
}

async function handleScheduleDatetimeTextStep(conv, chatId, text) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');
    const result = wizard.parseScheduleDatetimeKST(text);
    if (!result.valid) {
        await telegramBot.sendMessage(chatId, '형식이 올바르지 않아요. "YYYY-MM-DD HH:MM" 형식으로 다시 입력해주세요 (예: 2026-07-25 14:30)');
        return; // step을 그대로 둬서 재입력을 기다림
    }

    const answers = { ...conv.answers, schedule_type: 'scheduled', scheduled_at: result.date.toISOString() };
    await supabase.from('telegram_conversations')
        .update({ answers, step: 'confirm', updated_at: new Date().toISOString() })
        .eq('chat_id', chatId);
    if (result.adjusted) {
        await telegramBot.sendMessage(chatId, `입력하신 시각이 너무 이르거나 10분 단위가 아니어서 ${wizard.formatKST(result.date)}로 조정했어요.`);
    }
    await sendWizardSummary(chatId, answers);
}

async function sendWizardSummary(chatId, answers) {
    const telegramBot = require('./telegram_bot');
    const wizard = require('./telegram_wizard');
    const imageLabel = answers.image_source === 'stock' ? '무료 이미지' : 'AI 이미지 생성';
    const visOption = wizard.TELEGRAM_VISIBILITY_OPTIONS.find(v => v.value === answers.visibility);
    const scheduleLabel = answers.schedule_type === 'scheduled' && answers.scheduled_at
        ? `예약 (${wizard.formatKST(new Date(answers.scheduled_at))})`
        : '즉시';

    const text = `'${answers.main_keyword}'로 다음과 같이 발행할게요\n` +
        `서브키워드: ${answers.sub_keywords || '없음'}\n` +
        `말투: ${answers.tone}\n` +
        `이미지: ${imageLabel}\n` +
        `카테고리: ${answers.category}\n` +
        `세부요청: ${answers.custom_instructions || '없음'}\n` +
        `네이버 카테고리: ${answers.naver_category_name || '선택 안 함'}\n` +
        `글주제: ${answers.topic_id && answers.topic_id !== '0' ? answers.topic_id : '선택 안 함'}\n` +
        `공개설정: ${visOption?.label || answers.visibility}\n` +
        `지도: ${answers.use_map ? answers.map_address : '사용 안 함'}\n` +
        `발행: ${scheduleLabel}`;

    await telegramBot.sendMessageWithButtons(chatId, text, [
        { text: '발행하기', callback_data: 'wz:confirm:yes' },
        { text: '취소', callback_data: 'wz:confirm:no' },
    ]);
}

/**
 * 위저드 최종 확인/취소. 확인이면 위저드 답변으로 topic/category/content_json을 새로 채워서
 * (완성형 슬롯에서 시작된 경우 이미 써둔 원고 내용은 폐기) 생성을 시작한다. 두 원본 상태
 * (telegram_suggested/draft_pending_approval) 모두 여기서 같은 방식으로 처리되므로 CAS 가드는
 * .in('status', [...])로 두 값을 함께 허용한다.
 */
async function handleWizardConfirm(userId, chatId, conv, value) {
    const telegramBot = require('./telegram_bot');
    await supabase.from('telegram_conversations').delete().eq('chat_id', chatId); // 성공/취소 모두 위저드 종결

    if (value === 'no') {
        const { data, error } = await supabase.from('posts')
            .update({ status: 'cancelled' })
            .eq('id', conv.post_id).eq('user_id', userId)
            .in('status', ['telegram_suggested', 'draft_pending_approval'])
            .select('id');
        if (error) { console.error(`[Telegram] wizard confirm CAS 실패: ${error.message}`); return; }
        await telegramBot.sendMessage(chatId, data?.length ? '취소되었습니다.' : '이미 처리된 요청입니다.');
        return;
    }

    const a = conv.answers;
    const mainKeyword = a.main_keyword;

    // 네이티브 "새 포스팅" 탭이 만드는 publish_options와 완전히 같은 모양 —
    // prepareForExtension()이 topic JSON tail의 publish_options를 그대로 읽어서 쓴다.
    const publishOptions = {
        category_id: a.naver_category_id || '',
        category_name: a.naver_category_name || '',
        topic_id: a.topic_id || '0',
        visibility: a.visibility || 'all',
        allow_comments: a.allow_comments,
        allow_likes: a.allow_likes,
        allow_search: a.allow_search,
        allow_share: a.allow_share,
        allow_external: a.allow_external,
        is_notice: false,
        use_map: !!a.use_map,
        map_address: a.map_address || '',
    };

    const newTopic = `${mainKeyword}|||${JSON.stringify({
        main_keyword: mainKeyword,
        sub_keywords: a.sub_keywords || '',
        seo_category: a.tone,
        custom_instructions: a.custom_instructions || '',
        image_source: a.image_source,
        publish_options: publishOptions,
    })}`;

    // scheduled_at은 topic JSON 안이 아니라 posts.scheduled_at 컬럼에 직접 넣어야 한다 —
    // prepareForExtension()이 publish_options.scheduled_at을 항상 이 컬럼값으로 덮어써버리기 때문
    // (topic JSON 안에 넣어봐야 무시됨). status는 예약이든 즉시든 지금처럼 'generating' 그대로 —
    // 'pending'/'scheduled'로 절대 안 바꾸는 기존 안전 규칙 유지, 실제 예약은 크롬 확장프로그램이
    // 네이버 자체 예약발행 기능으로 처리한다.
    const updatePayload = {
        status: 'generating', topic: newTopic, category: a.category,
        content_json: { _trigger_type: 'manual', image_source: a.image_source }, // 기존 원고 내용 폐기
    };
    if (a.schedule_type === 'scheduled' && a.scheduled_at) {
        updatePayload.scheduled_at = a.scheduled_at;
    }

    const { data, error } = await supabase.from('posts')
        .update(updatePayload)
        .eq('id', conv.post_id).eq('user_id', userId)
        .in('status', ['telegram_suggested', 'draft_pending_approval'])
        .select('id');
    if (error) { console.error(`[Telegram] wizard confirm CAS 실패: ${error.message}`); return; }
    if (!data?.length) { await telegramBot.sendMessage(chatId, '이미 처리된 요청입니다.'); return; }

    await telegramBot.sendMessage(chatId, '알겠습니다! 원고를 생성해서 발행 큐에 올릴게요.');
    const port = process.env.PORT || process.env.ENGINE_PORT || 4000;
    fetch(`http://localhost:${port}/api/extension/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-engine-secret': process.env.ENGINE_API_SECRET },
        body: JSON.stringify({ post_id: conv.post_id }),
    }).catch(err => console.error(`[Telegram] wizard prepare 호출 실패: ${err.message}`));
}

// 텔레그램이 직접 호출하는 웹훅 — x-engine-secret이 아니라 텔레그램이 보내는 고정 시크릿 헤더로 검증한다.
// PortOne 웹훅과 달리 HMAC-over-rawbody가 아니라 단순 헤더 비교라 req.rawBody 불필요, req.body(JSON 파싱본) 그대로 사용.
// 내부에서 어떤 에러가 나든 최종적으로 200을 응답한다 — 텔레그램은 200을 못 받으면 같은 업데이트를
// 반복 재전송하는데, 아직 이 플로우엔 멱등성 보장 장치가 없어서 재시도가 오히려 중복 처리를 유발할 수 있음.
app.post('/api/telegram/webhook', async (req, res) => {
    const telegramBot = require('./telegram_bot');
    if (!telegramBot.verifyWebhookSecret(req)) {
        console.warn('[Telegram Webhook] 시크릿 토큰 불일치');
        return res.status(401).end();
    }

    try {
        const update = req.body;
        if (update.message?.text?.startsWith('/start')) {
            await handleTelegramStart(update.message);
        } else if (update.callback_query) {
            await handleTelegramCallback(update.callback_query);
        } else if (update.message?.text) {
            // 활성 위저드가 없는 사용자의 일반 텍스트는 handleTelegramFreeText 내부에서 조용히 무시됨
            await handleTelegramFreeText(update.message);
        }
    } catch (err) {
        console.error('[Telegram Webhook] 처리 오류:', err.message);
    }
    res.status(200).end();
});

// ════════════════════════════════════════
//  Start Server
// 서버 아웃바운드 IP + 프록시 TCP 연결 테스트
app.get('/api/myip', async (req, res) => {
    const net = require('net');
    const result = {};
    try {
        const r = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        result.outbound_ip = r.data.ip;
    } catch (e) {
        result.outbound_ip_error = e.message;
    }
    // TCP 연결 테스트 (SOCKS5 proxy)
    await new Promise((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(5000);
        sock.connect(2017, '211.241.151.17', () => {
            result.proxy_tcp = 'OK - TCP 연결 성공';
            sock.destroy();
            resolve();
        });
        sock.on('error', (e) => { result.proxy_tcp = `FAIL - ${e.message}`; resolve(); });
        sock.on('timeout', () => { result.proxy_tcp = 'FAIL - timeout'; sock.destroy(); resolve(); });
    });
    res.json(result);
});

// ════════════════════════════════════════
const PORT = process.env.PORT || process.env.ENGINE_PORT || 4000;

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Engine API] Server running on http://0.0.0.0:${PORT}`);
    axios.get('https://api.ipify.org?format=json', { timeout: 5000 })
        .then(r => console.log(`[Engine API] Outbound IP: ${r.data.ip}`))
        .catch(() => {});

    // 서버 재시작 시 zombie posts(generating/pending/posting) 초기화
    // 파이프라인 실행 중 서버가 종료되면 status가 갱신되지 않아 프론트 오버레이가 영구 차단됨
    try {
        const { data, error } = await supabase
            .from('posts')
            .update({ status: 'failed', error_message: '서버 재시작으로 인해 중단됨' })
            .in('status', ['generating', 'pending', 'posting'])  // pending_extension 제외 (확장 프로그램이 처리)
            .select('id');
        if (!error && data?.length > 0) {
            console.log(`[Engine API] Startup cleanup: ${data.length}개의 좀비 포스트를 failed로 초기화했습니다.`);
        }
    } catch (e) {
        console.warn(`[Engine API] Startup cleanup 실패: ${e.message}`);
    }

    // 서버 시작 시 1회 실행 후 매 24시간마다 반복
    cleanupTempFiles();
    setInterval(cleanupTempFiles, 24 * 60 * 60 * 1000);
    cleanupStorageImages();
    setInterval(cleanupStorageImages, 24 * 60 * 60 * 1000);

    // 예약/즉시 발행 트리거, 매일 순위 체크 등 정기 작업 스케줄러 시작
    // scheduler.js의 triggerPost()가 http://localhost:PORT로 이 서버를 호출하므로
    // 반드시 같은 프로세스(engine_api.js) 안에서 실행돼야 함
    const Scheduler = require('./scheduler');
    new Scheduler().start();
});

// Global 404 handler for debugging
app.use((req, res) => {
    console.warn(`[Engine API 404] Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found in Engine API', path: req.url });
});

// ════════════════════════════════════════
//  Graceful Shutdown
// ════════════════════════════════════════
async function shutdown(signal) {
    console.log(`[Engine API] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
        try {
            if (global.executor_instance?.browser) {
                await global.executor_instance.browser.close();
            }
        } catch (e) {
            console.error('[Engine API] Browser close error:', e.message);
        }
        console.log('[Engine API] Shutdown complete.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('[Engine API] Forced shutdown after timeout.');
        process.exit(1);
    }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
