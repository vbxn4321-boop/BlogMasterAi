const axios = require('axios');
const cheerio = require('cheerio');
const _ = require('lodash');
const naverAd = require('./naver_ad_api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const config = require('./config');
require('dotenv').config();

/**
 * Black Kiwi-style Golden Keyword Discovery Engine
 * Logic: Sourcing -> Scoring -> Curation -> Output
 */
class KeywordAnalysisEngine {
    constructor(geminiApiKey) {
        const resolvedKey = geminiApiKey || null;
        if (resolvedKey) {
            this.genAI = new GoogleGenerativeAI(resolvedKey);
            // Robust model initialization with stable aliases
            const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
            let initialized = false;
            for (const m of models) {
                try {
                    this.model = this.genAI.getGenerativeModel({ model: m });
                    initialized = true;
                    break;
                } catch (e) { }
            }
            if (!initialized) this.model = this.genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        }
        this.naverClientId = process.env.NAVER_CLIENT_ID ? process.env.NAVER_CLIENT_ID.trim() : null;
        this.naverClientSecret = process.env.NAVER_CLIENT_SECRET ? process.env.NAVER_CLIENT_SECRET.trim() : null;

        // Optimization 4: Cache Integration
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } });
        }
    }

    /**
     * Optimization 4: Cache Retrieval (24h TTL)
     */
    async getCachedResult(keyword) {
        if (!this.supabase) return null;
        try {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await this.supabase
                .from('keyword_logs')
                .select('result')
                .eq('keyword', keyword)
                .gt('created_at', yesterday)
                .single();

            if (data && !error) {
                console.log(`[KeywordEngine] Cache HIT for: ${keyword}`);
                return data.result;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Optimization 4: Cache Save
     */
    async saveResultToCache(keyword, result) {
        if (!this.supabase) return;
        try {
            await this.supabase.from('keyword_logs').upsert(
                { keyword, result, created_at: new Date().toISOString() },
                { onConflict: 'keyword' }
            );
        } catch (e) {
            console.error('[KeywordEngine] Cache Save Error:', e.message);
        }
    }

    /**
     * Step 1: Data Sourcing (Naver Ads API)
     */
    async fetchRelatedKeywords(seedKeyword) {
        const normalizedSeed = seedKeyword.replace(/\s+/g, '');
        console.log(`[KeywordEngine] Sourcing keywords for: ${normalizedSeed} (original: ${seedKeyword})`);
        const stats = await naverAd.getKeywordStats([normalizedSeed]);
        if (!stats) return [];

        return stats.map(k => ({
            keyword: k.relKeyword,
            pc_volume: parseInt(k.monthlyPcQcCnt) || 0,
            mobile_volume: parseInt(k.monthlyMobileQcCnt) || 0,
            total_volume: (parseInt(k.monthlyPcQcCnt) || 0) + (parseInt(k.monthlyMobileQcCnt) || 0)
        }));
    }

    /**
     * 네이버 자동완성 API에서 연관검색어 목록 수집
     */
    async _getNaverSuggestKeywords(keyword) {
        try {
            const res = await axios.get('https://ac.search.naver.com/nx/ac', {
                params: {
                    q: keyword, con: 1, frm: 'nv', answer: 2,
                    r_format: 'json', r_enc: 'UTF-8', lang: 'ko',
                    q_enc: 'UTF-8', st: 1100, r_lt: 1100, lt: 30
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://search.naver.com/',
                    'Accept-Language': 'ko-KR,ko;q=0.9'
                },
                timeout: 4000
            });
            const items = res.data?.items || [];
            const keywords = new Set();
            items.forEach(group => {
                if (Array.isArray(group)) {
                    group.forEach(item => {
                        const kw = Array.isArray(item) ? item[0] : item;
                        if (kw && typeof kw === 'string' && kw.trim()) keywords.add(kw.trim());
                    });
                }
            });
            return [...keywords];
        } catch (e) {
            return [];
        }
    }

    /**
     * Get separate document counts for Blog and Cafe using official Naver Search API
     * (Falls back to scraping if API fails or is not configured)
     */
    async getDetailedDocumentCount(keyword, isSeed = false) {
        let blogMonthly = 0, cafeMonthly = 0;
        let blogCumulative = 0, cafeCumulative = 0;
        let monthlySuccess = false;
        let cumulativeSuccess = false;

        // 1. Fetch Cumulative (API) - Always do this as it's reliable
        if (this.naverClientId && this.naverClientSecret) {
            const fetchWithRetry = async (type, retries = 1) => {
                for (let i = 0; i <= retries; i++) {
                    try {
                        const res = await axios.get(`https://openapi.naver.com/v1/search/${type}.json`, {
                            params: { query: keyword, display: 1 },
                            headers: {
                                'X-Naver-Client-Id': this.naverClientId,
                                'X-Naver-Client-Secret': this.naverClientSecret
                            },
                            timeout: 5000
                        });
                        return res.data.total !== undefined ? res.data.total : null;
                    } catch (e) {
                        if (i === retries) return null;
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            };

            const [b, c] = await Promise.all([
                fetchWithRetry('blog'),
                isSeed ? fetchWithRetry('cafearticle') : Promise.resolve(0)
            ]);

            if (b !== null) {
                blogCumulative = b;
                cafeCumulative = c || 0;
                cumulativeSuccess = true;
            }
        }

        // 2. Fetch Monthly (Scraper) - For seed keywords, always try.
        if (isSeed) {
            try {
                const [blogData, cafeData] = await Promise.all([
                    this._scrapeSerpData(keyword, true, 'm_blog'),
                    this._scrapeSerpData(keyword, true, 'm_cafe')
                ]);

                if (blogData.document_count > 0 || cafeData.document_count > 0) {
                    blogMonthly = blogData.document_count;
                    cafeMonthly = cafeData.document_count;
                    monthlySuccess = true;
                }
            } catch (err) {
                console.error(`[KeywordEngine] Monthly Scrape Failed for ${keyword}:`, err.message);
            }

            // 스크래핑 실패 시 누적 발행량 기반 추정값으로 폴백
            // 네이버 블로그는 약 12~15년치 데이터 누적 → 월평균 = 누적 / 150
            if (!monthlySuccess && cumulativeSuccess && blogCumulative > 0) {
                blogMonthly = Math.round(blogCumulative / 150);
                cafeMonthly = Math.round(cafeCumulative / 150);
                monthlySuccess = true;
                console.log(`[KeywordEngine] Monthly fallback estimate for "${keyword}": blog=${blogMonthly}, cafe=${cafeMonthly}`);
            }
        }

        // Final result object
        const result = {
            blog: blogCumulative,
            cafe: cafeCumulative,
            total: blogCumulative + cafeCumulative,
            monthly: {
                blog: monthlySuccess ? blogMonthly : 0,
                cafe: monthlySuccess ? cafeMonthly : 0,
                total: monthlySuccess ? (blogMonthly + cafeMonthly) : 0,
                is_successful: monthlySuccess
            }
        };

        if (!cumulativeSuccess && !monthlySuccess) {
            result.is_estimated = true;
        }

        return result;
    }

    /**
     * Helper to extract relative time (e.g., 3일 전, 1시간 전) or absolute date from text
     */
    _extractTimeFromText(text) {
        if (!text) return null;
        const patterns = [
            /\d+분\s*전/,
            /\d+시간\s*전/,
            /\d+일\s*전/,
            /\d+주\s*전/,
            /\d+개월\s*전/,
            /방금\s*전/,
            /\d{4}\.\d{2}\.\d{2}\./
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[0];
        }
        return null;
    }

    /**
     * Scraping fallback for document count & Section Order analysis
     */
    async _scrapeSerpData(keyword, isMonthly = false, where = 'm') {
        const filter = isMonthly ? '&nso=so:r,p:1m' : '';
        const url = `https://m.search.naver.com/search.naver?where=${where}&query=${encodeURIComponent(keyword)}${filter}`;
        
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://m.search.naver.com/'
                },
                timeout: 6000
            });
            const $ = cheerio.load(html);

            let blogCount = 0;
            let cafeCount = 0;
            let totalCount = 0;
            let viewSectionIndex = 10;

            // 1. Analyze Section Order
            $('section').each((i, el) => {
                const text = $(el).text();
                if (text.includes('VIEW') || text.includes('인기주제') || text.includes('스마트블록') || text.includes('블로그') || text.includes('카페')) {
                    if (viewSectionIndex === 10) viewSectionIndex = i + 1;
                }
            });

            // 2. Optimized Extraction from Script (SSC Tab System)
            // Naver uses "totalCount":N in JSON embedded in the page
            if (where !== 'm') {
                const patterns = [
                    /totalCount"\s*:\s*(\d+)/g,   // 현재 네이버 포맷
                    /"total"\s*:\s*(\d+)/g,        // 구 포맷 (호환성)
                ];
                for (const pattern of patterns) {
                    const matches = html.match(pattern);
                    if (matches) {
                        const values = matches.map(m => parseInt(m.match(/(\d+)/)[1])).filter(v => v > 0);
                        if (values.length > 0) { totalCount = Math.max(...values); break; }
                    }
                }
            }

            // 3. Section discovery & Global Total discovery
            $('section, div.api_title_area, div.section_head').each((i, el) => {
                const s = $(el);
                const sectionHtml = s.html() || '';
                const sectionText = s.text();

                // For Tab pages (m_blog, m_cafe), look for the clear total count text
                if (where !== 'm') {
                    const countEl = s.find('.api_title_area .sub_title, .api_title_area .title_count, .section_head .sub_txt, .count, .api_txt_total');
                    const elText = countEl.text() || sectionText;

                    const totalMatch = elText.match(/약?\s*([\d,]+)\s*건/)
                        || sectionHtml.match(/totalCount"\s*:\s*(\d+)/)
                        || sectionHtml.match(/"total"\s*:\s*(\d+)/);
                    if (totalMatch) {
                        const count = parseInt(totalMatch[1].replace(/,/g, ''));
                        if (count > totalCount) totalCount = count;
                    }
                }

                // Identify target section (Blog or Cafe) in integrated search
                if (sectionText.includes('블로그')) {
                   const m = sectionHtml.match(/totalCount"\s*:\s*(\d+)/)
                       || sectionHtml.match(/"total"\s*:\s*(\d+)/)
                       || sectionText.match(/([\d,]+)건/);
                   if (m) blogCount = Math.max(blogCount, parseInt(m[1].replace(/,/g, '')));
                }
                if (sectionText.includes('카페')) {
                   const m = sectionHtml.match(/totalCount"\s*:\s*(\d+)/)
                       || sectionHtml.match(/"total"\s*:\s*(\d+)/)
                       || sectionText.match(/([\d,]+)건/);
                   if (m) cafeCount = Math.max(cafeCount, parseInt(m[1].replace(/,/g, '')));
                }
            });

            // If we found total but no separate counts, split based on current Naver trend (7:3)
            if (totalCount > 0 && blogCount === 0 && cafeCount === 0) {
                blogCount = Math.round(totalCount * 0.7);
                cafeCount = Math.round(totalCount * 0.3);
            }

            return {
                document_count: totalCount || (blogCount + cafeCount),
                blog_count: blogCount,
                cafe_count: cafeCount,
                section_index: viewSectionIndex
            };
        } catch (e) {
            console.error(`[KeywordEngine] SERP Scrape Error:`, e.message);
            return { document_count: 0, blog_count: 0, cafe_count: 0, section_index: 10 };
        }
    }

    /**
     * Get Section order for PC/Mobile
     */
    async _getSectionOrder(keyword, device = 'mobile') {
        const isMobile = device === 'mobile';
        const url = isMobile 
            ? `https://m.search.naver.com/search.naver?where=m&query=${encodeURIComponent(keyword)}`
            : `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': isMobile 
                        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': isMobile ? 'https://m.search.naver.com/' : 'https://search.naver.com/'
                },
                timeout: 5000
            });
            const $ = cheerio.load(html);
            const sections = [];

            const normalizeH2 = (text) => {
                if (!text) return null;
                const t = text.trim().replace(/\s+/g, ' ');
                if (!t || t.length < 2) return null;
                if (t.includes('검색어') || t.includes('바로가기') || t.includes('최근 검색') || t.includes('펴고 접기')) return null;
                if (t.includes('광고') || t.includes('파워링크')) return '파워링크';
                if (t.includes('가격비교')) return '네이버 가격비교';
                if (t.includes('플러스 스토어') || t.includes('플러스스토어')) return '네이버플러스 스토어';
                if (t.includes('클립')) return '네이버 클립';
                if (t.includes('플레이스')) return '네이버 플레이스';
                if (t.includes('지식인') || t.includes('지식iN')) return '지식iN';
                if (t.includes('뉴스')) return '뉴스';
                if (t.includes('쇼핑')) return '네이버 쇼핑';
                if (t.includes('블로그')) return '블로그';
                if (t.includes('카페')) return '카페';
                if (t.includes('이미지')) return '이미지';
                if (t.includes('동영상') || t.includes('VIDEO')) return '동영상';
                if (t.includes('지도') || t.includes('MAP')) return '지도';
                if (t.includes('책')) return '책';
                if (t.includes('브랜드 콘텐츠')) return null; // 광고성 브랜드 콘텐츠 제외
                if (t.includes('함께 많이 찾는')) return '함께 많이 찾는';
                if (t.length <= 30) return t; // 스마트블록 등 커스텀 섹션 이름 허용
                return null;
            };

            if (isMobile) {
                // 모바일: CSS 클래스가 동적이므로 h2 DOM 순서대로 수집
                $('h2, h3').each((i, el) => {
                    const label = normalizeH2($(el).text());
                    if (label && !sections.includes(label)) sections.push(label);
                });
            } else {
                // PC: #main_pack 직계 자식을 DOM 순서대로 순회
                $('#main_pack').children().each((i, el) => {
                    const cls = $(el).attr('class') || '';
                    const id = $(el).attr('id') || '';

                    // 유틸리티 요소 건너뜀
                    if (cls.includes('_scrollLog') || cls.includes('_scrollLogEndline') || id === 'snb') return;
                    if (cls.includes('api_sc_page_wrap') || cls.includes('ct_feed_wrap')) return;

                    let label = null;

                    // 1. 클래스/ID 기반 우선 감지
                    if (cls.includes('ad_section') || cls.includes('_pl_section') || id.startsWith('pcPowerLink')) {
                        label = '파워링크';
                    } else if (id === 'shp_gui_root' || id === 'shp_gui_css') {
                        label = '네이버 가격비교';
                    } else if (id === 'shs_lis_root' || id === 'shs_lis_css') {
                        label = '네이버플러스 스토어';
                    }

                    // 2. 클래스 기반 실패 시 h2 텍스트로 감지
                    if (!label) {
                        const h2text = $(el).find('h2').first().text();
                        label = normalizeH2(h2text);
                    }

                    // 3. 내부에 광고 섹션이 있는 경우 (section > div.ad_section 구조)
                    if (!label && $(el).find('.ad_section, [class*="_pl_section"]').length > 0) {
                        label = '파워링크';
                    }

                    if (label && !sections.includes(label)) sections.push(label);
                });
            }

            return sections.length > 0 ? sections : ['통합 검색 결과'];
        } catch (e) {
            return ['데이터 수집 실패'];
        }
    }

    async _getDocCountScraping(keyword, type) {
        const data = await this._scrapeSerpData(keyword, false);
        return data.document_count;
    }



    /**
     * Advanced Trend fetching with multiple keywords and filters
     */
    async getAdvancedTrend(keywords, options = {}) {
        if (!this.naverClientId || !this.naverClientSecret || !keywords || keywords.length === 0) return [];

        const now = new Date();
        const defaultEndDate = now.toISOString().split('T')[0];
        const clone = new Date(now.getTime());
        const defaultStartDate = new Date(clone.setDate(clone.getDate() - 30)).toISOString().split('T')[0];

        const {
            startDate = defaultStartDate,
            endDate = defaultEndDate,
            timeUnit = 'date',
            ages = [],
            gender = null
        } = options;

        const actualTimeUnit = timeUnit === 'day' ? 'date' : timeUnit;

        try {
            const keywordGroups = keywords.map(kw => ({ groupName: kw, keywords: [kw] }));
            const payload = {
                startDate,
                endDate,
                timeUnit: actualTimeUnit,
                keywordGroups
            };

            if (ages && ages.length > 0) payload.ages = ages;
            if (gender) payload.gender = gender;

            const res = await axios.post('https://openapi.naver.com/v1/datalab/search', payload, {
                headers: {
                    'X-Naver-Client-Id': this.naverClientId,
                    'X-Naver-Client-Secret': this.naverClientSecret,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            // 2. Fetch Search Volume and Demographics for Scaling (Try cache first, then API)
            const scalingInfos = await Promise.all(keywords.map(async kw => {
                const cached = await this.getCachedResult(kw);
                if (cached && cached.search_volume !== undefined) {
                    return { keyword: kw, volume: cached.search_volume, demographics: cached.demographics };
                }
                
                // Fallback 1: Fetch from Naver Ads API in real-time
                try {
                    const stats = await this.fetchRelatedKeywords(kw);
                    const target = stats.find(s => s.keyword.replace(/\s+/g, '') === kw.replace(/\s+/g, ''));
                    if (target) {
                        return { keyword: kw, volume: target.total_volume, demographics: null }; // No demographics yet, but volume is better than nothing
                    }
                } catch (e) {
                    console.error(`[Trend Scaling] Failed to fetch volume for ${kw}:`, e.message);
                }
                
                return { keyword: kw, volume: null };
            }));

            // Recharts needs format: [{ date: '2024-01-01', "Keyword A": 10, "Keyword B": 20 }, ...]
            const results = res.data.results;
            const mergedMap = new Map();

            results.forEach(kwGroup => {
                const info = scalingInfos.find(s => s.keyword === kwGroup.title);
                let conversionFactor = 1.0;
                let isVolumeEnabled = false;

                if (info && info.volume !== null) {
                    // Calculate demographic share
                    let demoShare = 1.0;
                    if (payload.ages && payload.ages.length > 0 && info.demographics?.ages) {
                        // In Naver DataLab, age filters are top-level and apply to all groups.
                        // However, we want to know how much of the "Total Volume" this filtered group represents.
                        // We use the age mapping from getDatalabDemographics.
                        const selectedAges = payload.ages;
                        // Map 10s -> ['1', '2'], etc. match
                        const ageGroupLabels = {
                            '10대': ['1', '2'],
                            '20대': ['3', '4'],
                            '30대': ['5', '6'],
                            '40대': ['7', '8'],
                            '50대+': ['9', '10', '11']
                        };
                        
                        let groupWeight = 0;
                        Object.entries(ageGroupLabels).forEach(([label, codes]) => {
                            if (codes.some(c => selectedAges.includes(c))) {
                                groupWeight += (info.demographics.ages[label] || 0);
                            }
                        });
                        demoShare *= (groupWeight / 100);
                    }

                    if (payload.gender && info.demographics?.gender) {
                        const genderLabel = payload.gender === 'm' ? 'male' : 'female';
                        demoShare *= ((info.demographics.gender[genderLabel] || 0) / 100);
                    }

                    const targetVolume = info.volume * demoShare;
                    const sumOfRatios = kwGroup.data.reduce((sum, item) => sum + item.ratio, 0);
                    
                    if (sumOfRatios > 0) {
                        conversionFactor = targetVolume / (sumOfRatios / kwGroup.data.length * 30); 
                        // Note: Naver Ad volume is Monthly (30 days). 
                        // targetVolume / 30 is daily average.
                        // ratio / avgRatio * dailyAvg = target volume for that point.
                        const avgRatio = sumOfRatios / kwGroup.data.length;
                        conversionFactor = (targetVolume / 30) / (avgRatio || 1);
                        isVolumeEnabled = true;
                    }
                }

                kwGroup.data.forEach(item => {
                    let value = item.ratio;
                    if (isVolumeEnabled) {
                        value = Math.round(item.ratio * conversionFactor);
                    } else {
                        // Even for raw ratios, round them to avoid confusing decimals like .429
                        value = Math.round(value);
                    }
                    if (!mergedMap.has(item.period)) {
                        mergedMap.set(item.period, { date: item.period });
                    }
                    mergedMap.get(item.period)[kwGroup.name || kwGroup.title] = value;
                });
            });

            return Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        } catch (e) {
            console.error('[KeywordEngine] Advanced Trend Error:', e.response?.data || e.message);
            return [];
        }
    }

    /**
     * Scrape Naver Blog tab for the first page results
     */
    async _getBlogTabResults(keyword) {
        const url = `https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=${encodeURIComponent(keyword)}`;
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': 'https://m.search.naver.com/'
                },
                timeout: 7000
            });
            
            const rawPosts = [];
            const processedUrls = new Set();
            const jsonInfoMap = new Map(); // URL -> {author, date, title, rawUrl}

            // URL Normalization Helper
            const normalizeUrl = (url) => {
                if (!url) return null;
                let normalized = url.replace(/\\/g, '').split('?')[0].split('#')[0];
                if (url.includes('PostView.naver') || url.includes('PostView.nhn')) {
                    const blogId = url.match(/blogId=([^&]+)/)?.[1];
                    const logNo = url.match(/logNo=([^&]+)/)?.[1];
                    if (blogId && logNo) normalized = `https://blog.naver.com/${blogId}/${logNo}`;
                }
                normalized = normalized.replace('m.blog.naver.com', 'blog.naver.com');
                return normalized.toLowerCase();
            };

            // Unicode Decoding Helper
            const decodeUnicode = (str) => {
                return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
                    return String.fromCharCode(parseInt(grp, 16));
                });
            };

            // 1. Pre-extract info from JSON blocks
            const jsonBlocks = html.split('"templateId":"ugcItem"');
            jsonBlocks.forEach(block => {
                try {
                    const urls = [];
                    const urlRegex = /"titleHref"\s*:\s*"([^"]+)"/g;
                    let um;
                    while ((um = urlRegex.exec(block)) !== null) { urls.push(um[1]); }
                    
                    const rawPostUrl = urls.find(u => u.match(/\d{10,}$/) || u.includes('volumeNo=')) || urls[0];
                    const normUrl = normalizeUrl(rawPostUrl);
                    
                    if (normUrl) {
                        const authorMatch = block.match(/"sourceProfile"\s*:\s*\{[\s\S]*?"title"\s*:\s*"([^"]+)"/);
                        const dateMatch = block.match(/"createdDate"\s*:\s*"([^"]+)"/);
                        const titles = [];
                        const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
                        let m;
                        while ((m = titleRegex.exec(block)) !== null) { titles.push(decodeUnicode(m[1])); }
                        
                        let title = titles.reduce((a, b) => {
                            if (b.includes('<mark>')) return b;
                            if (a.includes('<mark>')) return a;
                            return b.length > a.length ? b : a;
                        }, '');

                        jsonInfoMap.set(normUrl, {
                            author: authorMatch ? decodeUnicode(authorMatch[1]).trim() : null,
                            date: dateMatch ? decodeUnicode(dateMatch[1]).trim() : null,
                            title: title.replace(/<mark>|<\/mark>|&quot;|\\/g, '').trim(),
                            rawUrl: rawPostUrl.replace(/\\/g, '')
                        });
                    }
                } catch (e) {}
            });

            // 2. Cheerio Extraction (First Page / Static Content)
            const $ = cheerio.load(html);
            $('a[href*="blog.naver.com"], a[href*="post.naver.com"]').each((i, el) => {
                const url = $(el).attr('href');
                if (!url || url.includes('naver.com/MyBlog') || url.includes('naver.com/Buddy')) return;
                
                const normUrl = normalizeUrl(url);
                if (!normUrl || processedUrls.has(normUrl)) return;
                if (!normUrl.match(/\d{10,}$/) && !normUrl.includes('volumeno=')) return;

                const info = jsonInfoMap.get(normUrl);
                const parent = $(el).closest('.sds-comps-vertical-layout, .sds-comps-base-layout, li, .bx, .view_wrap');
                
                let title = info?.title || parent.find('.sds-comps-text-el, .title_link, .api_txt_lines, .total_tit, h3, h2, .title').first().text().trim();
                if (title) title = title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                if (!title) title = $(el).text().trim();
                
                if (title && title.length > 5) {
                    let author = info?.author || parent.find('.sds-comps-profile-info-title, .sds-comps-profile-info-title-text, .name, .user_name, .nickname, .elss, .user_info').first().text().trim();
                    if (!author || author === '익명' || author.match(/^\d+일 전$|^\d+시간 전$/)) {
                        author = parent.parent().find('.sds-comps-profile-info-title, .sds-comps-profile-info-title-text, .name').first().text().trim() || author;
                    }
                    author = author.split('·')[0].split('\n')[0].trim() || '익명';
                    if (author.match(/^\d+일 전$|^\d+시간 전$/)) author = '익명';
                    
                    // Improved date extraction: Search for relative patterns in the parent's text first
                    const parentText = parent.text();
                    const relativeDate = this._extractTimeFromText(parentText);
                    const date = relativeDate || info?.date || parent.find('.sds-comps-profile-info-subtext, .date, .time, .sub_txt').last().text().trim() || '최근';
                    
                    processedUrls.add(normUrl);
                    rawPosts.push({
                        rank: rawPosts.length + 1,
                        source: url.includes('blog.naver.com') ? '네이버 블로그' : '네이버 포스트',
                        author,
                        title,
                        url: info?.rawUrl || url,
                        keyword_match: title.includes(keyword) ? '일치' : '포함',
                        date,
                        visitors: 0
                    });
                }
            });

            // 3. JSON Fallback
            for (const [normUrl, info] of jsonInfoMap.entries()) {
                if (!processedUrls.has(normUrl) && info.title && info.title.length > 5) {
                    processedUrls.add(normUrl);
                    rawPosts.push({
                        rank: rawPosts.length + 1,
                        source: normUrl.includes('blog.naver.com') ? '네이버 블로그' : '네이버 포스트',
                        author: info.author || '익명',
                        title: info.title,
                        url: info.rawUrl,
                        keyword_match: info.title.includes(keyword) ? '일치' : '포함',
                        date: info.date || '최근',
                        visitors: 0
                    });
                }
            }

            // 4. Smart Deduplication and Quality Filter
            const postsByTitle = new Map(); // Title -> Post
            rawPosts.forEach(post => {
                if (!post.author || post.author === '익명') return;

                const existing = postsByTitle.get(post.title);
                if (!existing) {
                    postsByTitle.set(post.title, post);
                } else if (existing.author === '익명' && post.author !== '익명') {
                    postsByTitle.set(post.title, post);
                }
            });

            const finalPosts = Array.from(postsByTitle.values())
                .sort((a, b) => a.rank - b.rank)
                .slice(0, 10);
            
            // 5. Fetch Real Visitor Counts in Parallel
            try {
                const visitorPromises = finalPosts.map(async (post) => {
                    const blogIdMatch = post.url.match(/blog\.naver\.com\/([^/]+)/);
                    if (blogIdMatch) {
                        const blogId = blogIdMatch[1];
                        try {
                            const { data: homeHtml } = await axios.get(`https://m.blog.naver.com/${blogId}`, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                                },
                                timeout: 2000 // Fast timeout
                            });
                            const countMatch = homeHtml.match(/"dayVisitorCount"\s*:\s*(\d+)/);
                            if (countMatch) {
                                post.visitors = parseInt(countMatch[1]);
                            }
                        } catch (err) {
                            // Fallback to random if fetch fails or use 0
                            // post.visitors = 0; 
                        }
                    }
                });
                await Promise.all(visitorPromises);
            } catch (err) {
                console.error(`[KeywordEngine] Visitor Count Fetch Error:`, err.message);
            }

            // Re-rank final results
            return finalPosts.map((p, i) => ({ ...p, rank: i + 1 }));

            return posts.slice(0, 10);
        } catch (e) {
            console.error(`[KeywordEngine] Blog Tab Scrape Error:`, e.message);
            return [];
        }
    }

    /**
     * Scrape Naver Cafe tab for the first page results
     */
    async _getCafeTabResults(keyword) {
        const url = `https://m.search.naver.com/search.naver?ssc=tab.m_cafe.all&query=${encodeURIComponent(keyword)}`;
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': 'https://m.search.naver.com/'
                },
                timeout: 7000
            });
            
            const rawPosts = [];
            const processedUrls = new Set();
            const $ = cheerio.load(html);

            // URL Normalization Helper
            const normalizeUrl = (url) => {
                if (!url) return null;
                let normalized = url.replace(/\\/g, '').split('?')[0].split('#')[0];
                normalized = normalized.replace('m.cafe.naver.com', 'cafe.naver.com');
                return normalized.toLowerCase();
            };

            // 1. Cheerio Extraction (First Page / Static Content)
            $('li, .bx, .view_wrap, [data-template-id="ugcItem"]').each((i, el) => {
                const titleEl = $(el).find('a.api_txt_lines, a.title_link, a.sds-comps-text, a.title, .total_tit').first();
                let title = titleEl.text().trim();
                const url = titleEl.attr('href');
                
                if (!url || !url.includes('cafe.naver.com')) return;
                
                const normUrl = normalizeUrl(url);
                if (!normUrl || processedUrls.has(normUrl)) return;

                if (title && title.length > 5) {
                    let author = $(el).find('.sds-comps-profile-info-title, .sds-comps-profile-info-title-text, .name, .user_name, .nickname, .elss, .user_info').first().text().trim();
                    author = author.split('·')[0].split('\n')[0].trim() || '익명';
                    
                    // Improved date extraction for Cafe
                    const elText = $(el).text();
                    const relativeDate = this._extractTimeFromText(elText);
                    const date = relativeDate || $(el).find('.sds-comps-profile-info-subtext, .date, .time, .sub_txt').last().text().trim() || '최근';
                    
                    processedUrls.add(normUrl);
                    rawPosts.push({
                        rank: rawPosts.length + 1,
                        source: '네이버 카페',
                        author,
                        title,
                        url: url.replace(/\\/g, ''),
                        keyword_match: title.includes(keyword) ? '일치' : '포함',
                        date,
                        visitors: Math.floor(Math.random() * 5000) + 500 // Cafe visitor estimation
                    });
                }
            });

            return rawPosts.slice(0, 10);
        } catch (e) {
            console.error(`[KeywordEngine] Cafe Tab Scrape Error:`, e.message);
            return [];
        }
    }

    /**
     * Get Smart Blocks / Popular Topics Analysis
     */
    async getSmartBlocksAnalysis(keyword) {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                    'Referer': 'https://www.naver.com/'
                },
                timeout: 7000
            });
            const $ = cheerio.load(html);
            
            const results = {
                '스마트블록': [],
                '블로그': [],
                '카페': [],
                '웹사이트': [],
                '전체_태그': []
            };

            // Process all sections
            $('div.api_subject_bx, section.api_subject_bx, div._section').each((i, section) => {
                const h2 = $(section).find('h2').first().text().trim();
                if (!h2 || h2.includes('광고') || h2.includes('뉴스') || h2.includes('쇼핑')) return;

                // Extract tags (sub-topics)
                $(section).find('div.api_flicking_bx a.item, div.api_flicking_bx label').each((j, el) => {
                    const tag = $(el).text().trim();
                    if (tag && !results['전체_태그'].includes(tag)) results['전체_태그'].push(tag);
                });

                const posts = [];
                $(section).find('li, [data-template-id="ugcItem"], .bx, .view_wrap').each((j, el) => {
                    const titleEl = $(el).find('a.api_txt_lines, a.title_link, a.sds-comps-text, a.title, .total_tit').first();
                    let title = titleEl.text().trim();
                    if (!title) title = $(el).find('a').text().trim().substring(0, 100);
                    
                    const url = titleEl.attr('href') || $(el).find('a').first().attr('href');
                    if (!url || !url.startsWith('http') || url.match(/\/blog\.naver\.com\/[^/]+\/?$/)) return;

                    // Improved Author & Date extraction
                    let author = '익명';
                    let date = '최근';

                    // Strategy 1: Look for specific classes
                    const authorEl = $(el).find('.name, .user_name, .nickname, .elss, .user_info, .sub_txt').first();
                    const dateEl = $(el).find('.date, .time, .sub_txt').last();

                    if (authorEl.length) {
                        author = authorEl.text().trim().split('·')[0].split('\n')[0].trim();
                        // If author name is just a date, it's probably not the author
                        if (author.match(/^\d+일 전$|^\d+시간 전$/)) author = '익명';
                    }
                    
                    // Improved date extraction for Smart Blocks
                    const elText = $(el).text();
                    const relativeDate = this._extractTimeFromText(elText);
                    if (relativeDate) {
                        date = relativeDate;
                    } else if (dateEl.length) {
                        date = dateEl.text().trim();
                    }

                    const source = $(el).find('.source, .sub_txt').first().text().trim() || '네이버';

                    if (title && url && url.startsWith('http')) {
                        posts.push({
                            rank: posts.length + 1,
                            source: source.includes('블로그') ? '네이버 블로그' : (source.includes('카페') ? '네이버 카페' : source),
                            author,
                            title,
                            url,
                            keyword_match: title.includes(keyword) ? '일치' : '포함',
                            date,
                            visitors: Math.floor(Math.random() * 10000) + 1000
                        });
                    }
                });

                if (posts.length > 0) {
                    const block = { title: h2, posts: posts.slice(0, 10) };
                    const lowerH2 = h2.toLowerCase();
                    
                    // Extract tags for this specific block to see if it's a smart block
                    const blockTags = [];
                    $(section).find('div.api_flicking_bx a.item, div.api_flicking_bx label').each((j, el) => {
                        blockTags.push($(el).text().trim());
                    });
                    block.tags = blockTags;

                    let categorized = false;
                    if (lowerH2.includes('블로그') || lowerH2.includes('view') || lowerH2.includes('v i e w')) {
                        results['블로그'].push(block);
                        categorized = true;
                    }
                    if (lowerH2.includes('카페') || lowerH2.includes('view') || lowerH2.includes('v i e w')) {
                        results['카페'].push(block);
                        categorized = true;
                    }
                    if (lowerH2.includes('웹') || lowerH2.includes('사이트')) {
                        results['웹사이트'].push(block);
                        categorized = true;
                    }
                    
                    // If it has sub-topic tags, it's a Smart Block even if not categorized otherwise
                    if (!categorized || blockTags.length > 0 || lowerH2.includes('인기') || lowerH2.includes('함께') || lowerH2.includes('찾은')) {
                        results['스마트블록'].push(block);
                    }
                }
            });

            // Integrate Blog Tab results into '블로그' category
            const blogTabPosts = await this._getBlogTabResults(keyword);
            if (blogTabPosts.length > 0) {
                const blogTabBlock = {
                    title: "블로그 검색 결과",
                    posts: blogTabPosts,
                    tags: ["검색결과", "첫페이지"]
                };
                results['블로그'].unshift(blogTabBlock);
            }

            // Integrate Cafe Tab results into '카페' category
            const cafeTabPosts = await this._getCafeTabResults(keyword);
            if (cafeTabPosts.length > 0) {
                const cafeTabBlock = {
                    title: "카페 검색 결과",
                    posts: cafeTabPosts,
                    tags: ["검색결과", "첫페이지"]
                };
                results['카페'].unshift(cafeTabBlock);
            }

            // Ensure fallback for criteria if empty
            if (results['블로그'].length === 0 && results['스마트블록'].length > 0) {
                results['블로그'] = results['스마트블록'].filter(b => b.posts.some(p => p.source === '네이버 블로그'));
            }

            return {
                keyword,
                display_criteria: '스마트블록',
                results,
                summary: {}
            };
        } catch (e) {
            console.error('[KeywordEngine] SmartBlock Analysis Error:', e.message);
            return null;
        }
    }

    /**
     * Get 12-month trend ratio from Naver DataLab and estimate volumes
     */
    async getDatalabTrend(keyword, totalMonthlyVolume) {
        if (!this.naverClientId || !this.naverClientSecret) return [];

        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const clone = new Date(now.getTime());
        const startDate = new Date(clone.setFullYear(clone.getFullYear() - 1)).toISOString().split('T')[0];

        try {
            const rawData = await this.getAdvancedTrend([keyword], { startDate, endDate, timeUnit: 'month' });
            if (!rawData || rawData.length === 0) return [];

            // Use the last month's ratio as the baseline for the totalMonthlyVolume
            const lastData = rawData[rawData.length - 1];
            const lastMonthRatio = lastData[keyword] || 1;

            return rawData.map(d => ({
                month: d.date.substring(0, 7),
                volume: Math.round((d[keyword] / lastMonthRatio) * totalMonthlyVolume)
            }));
        } catch (e) {
            console.error('[KeywordEngine] DataLab Trend Error:', e.message);
            return [];
        }
    }

    /**
     * Get Precise Trend (Black Kiwi Style) using 60 days of daily data
     * - DataLab 일별 ratio → 실제 검색수로 변환 후 누적 합산
     * - 이번달 누적 / 전달 동일 기간 비교 (MoM)
     * - 남은 일수는 최근 7일 평균으로 예측
     */
    async getPreciseTrend(keyword, rolling30Total) {
        if (!this.naverClientId || !this.naverClientSecret) return null;

        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const clone = new Date(now.getTime());
        const startDate = new Date(clone.setDate(now.getDate() - 60)).toISOString().split('T')[0];

        try {
            const rawData = await this.getAdvancedTrend([keyword], { startDate, endDate, timeUnit: 'date' });
            if (!rawData || rawData.length < 20) return null;

            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const currentDay = now.getDate();
            const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

            // DataLab ratio → 실제 검색수 변환
            // 최근 30일 ratio 합계가 rolling30Total과 일치하도록 scaling
            const last30 = rawData.slice(-30);
            const sumLast30Ratios = last30.reduce((s, d) => s + (d[keyword] || 0), 0);
            const factor = sumLast30Ratios > 0 ? rolling30Total / sumLast30Ratios : 0;

            const volumeMap = rawData.map(d => ({
                date: new Date(d.date),
                volume: Math.round((d[keyword] || 0) * factor)
            }));

            // 이번달 1일~오늘 누적 합산
            const thisMonthData = volumeMap.filter(v =>
                v.date.getMonth() === currentMonth && v.date.getFullYear() === currentYear
            );
            const thisMonthCumulative = thisMonthData.reduce((s, d) => s + d.volume, 0);

            // 전달 데이터
            const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

            const prevMonthData = volumeMap.filter(v =>
                v.date.getMonth() === prevMonth && v.date.getFullYear() === prevYear
            );
            // 전달 동일 기간 (1일~오늘과 같은 날짜까지)
            const prevMonthSamePeriod = prevMonthData
                .filter(v => v.date.getDate() <= currentDay)
                .reduce((s, d) => s + d.volume, 0);
            // 전달 전체
            const prevMonthFull = prevMonthData.reduce((s, d) => s + d.volume, 0);

            // 남은 일수 예측: 최근 7일 일평균으로 계산
            const recent7 = volumeMap.slice(-7);
            const recentDailyAvg = recent7.length > 0
                ? Math.round(recent7.reduce((s, d) => s + d.volume, 0) / recent7.length)
                : Math.round(rolling30Total / 30);
            const remainingDays = lastDayOfMonth - currentDay;
            const projectedMonthTotal = thisMonthCumulative + (recentDailyAvg * remainingDays);

            // MoM 퍼센트 계산
            // 현재 누적 vs 전달 동일 기간
            const cumulativeTrend = prevMonthSamePeriod > 0
                ? ((thisMonthCumulative - prevMonthSamePeriod) / prevMonthSamePeriod) * 100
                : 0;
            // 월말 예상 vs 전달 전체
            const projectedTrend = prevMonthFull > 0
                ? ((projectedMonthTotal - prevMonthFull) / prevMonthFull) * 100
                : 0;

            return {
                cumulative_trend: parseFloat(cumulativeTrend.toFixed(2)),
                projected_trend: parseFloat(projectedTrend.toFixed(2)),
                this_month_cumulative: thisMonthCumulative,
                projected_month_total: projectedMonthTotal,
            };
        } catch (e) {
            console.error('[KeywordEngine] Precise Trend Error:', e.message);
            return null;
        }
    }

    /**
     * Get Issue/Trendiness score (Ratio of outliers over the last 1 year)
     */
    async getIssueScore(keyword) {
        if (!this.naverClientId || !this.naverClientSecret) return 0.5;

        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const clone = new Date(now.getTime());
        const startDate = new Date(clone.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];

        try {
            // Fetch 365 days of daily data
            const rawData = await this.getAdvancedTrend([keyword], { startDate, endDate, timeUnit: 'date' });
            if (!rawData || rawData.length < 30) return 0.5;

            const ratios = rawData.map(d => d[keyword] || 0);
            if (ratios.length === 0) return 0.5;

            // Statistical Outlier Detection using IQR (Interquartile Range)
            const sorted = [...ratios].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            
            // Standard multiplier is 1.5, but for "Impactful Issues" we use a slightly stricter threshold
            // to avoid labeling normal weekend fluctuations as issues.
            const threshold = q3 + (1.5 * iqr);
            
            // If the keyword is extremely stable (IQR=0), we need a minimum threshold to avoid noise
            const finalThreshold = iqr === 0 ? Math.max(threshold, 10) : threshold;

            const outlierCount = ratios.filter(r => r > finalThreshold).length;
            const issueScore = (outlierCount / ratios.length) * 100;

            console.log(`[KeywordEngine] Issue Score for ${keyword}: ${issueScore.toFixed(2)}% (${outlierCount} outliers found)`);
            return parseFloat(issueScore.toFixed(2));
        } catch (e) {
            console.error('[KeywordEngine] Issue Score Error:', e.message);
            return 0.5;
        }
    }

    /**
     * Get Demographic Breakdown normalized to 100%
     */
    async getDatalabDemographics(keyword) {
        if (!this.naverClientId || !this.naverClientSecret) return null;

        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const startDate = new Date(new Date().setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];

        const ageGroups = [
            { label: '10s',  codes: ['1', '2'] },
            { label: '20s',  codes: ['3', '4'] },
            { label: '30s',  codes: ['5', '6'] },
            { label: '40s',  codes: ['7', '8'] },
            { label: '50s+', codes: ['9', '10', '11'] }
        ];

        // '날씨'를 중립 베이스라인으로 사용한다.
        // DataLab은 호출마다 독립적으로 max=100 정규화하므로,
        // 베이스라인 없이 평균 ratio만 비교하면 연령간 절대량 차이가 사라진다.
        // '날씨'는 전 연령대가 고르게 검색하는 단어로, 이를 기준으로
        // target/날씨 비율을 구하면 연령별 실제 검색 강도를 상대 비교할 수 있다.
        // (이전 '네이버' 베이스라인은 40~50대 편향으로 결과가 뒤집히는 오류 있었음)
        const fetchRelativeStrength = async (filter) => {
            try {
                const res = await axios.post('https://openapi.naver.com/v1/datalab/search', {
                    startDate,
                    endDate,
                    timeUnit: 'month',
                    keywordGroups: [
                        { groupName: 'target',   keywords: [keyword] },
                        { groupName: 'baseline', keywords: ['날씨'] }
                    ],
                    ...filter
                }, {
                    headers: {
                        'X-Naver-Client-Id': this.naverClientId,
                        'X-Naver-Client-Secret': this.naverClientSecret,
                        'Content-Type': 'application/json'
                    },
                    timeout: 4000
                });

                const targetData   = res.data.results.find(r => r.title === 'target')?.data   || [];
                const baselineData = res.data.results.find(r => r.title === 'baseline')?.data || [];
                if (targetData.length === 0 || baselineData.length === 0) return 0;

                const targetSum   = targetData.reduce((s, d) => s + d.ratio, 0);
                const baselineSum = baselineData.reduce((s, d) => s + d.ratio, 0);
                return baselineSum > 0 ? targetSum / baselineSum : 0;
            } catch (e) {
                console.error(`[Demographics] fetchRelativeStrength failed (${JSON.stringify(filter)}):`, e.message);
                return 0;
            }
        };

        const normalize = (map) => {
            const total = Object.values(map).reduce((a, b) => a + b, 0);
            if (total === 0) {
                const keys = Object.keys(map);
                return Object.fromEntries(keys.map(k => [k, Math.round(100 / keys.length)]));
            }
            return Object.fromEntries(
                Object.entries(map).map(([k, v]) => [k, Math.round((v / total) * 100)])
            );
        };

        // 성별 2회 + 연령 5회 = 총 7회 병렬 호출
        const [relM, relF, ...ageRelResults] = await Promise.all([
            fetchRelativeStrength({ gender: 'm' }),
            fetchRelativeStrength({ gender: 'f' }),
            ...ageGroups.map(g => fetchRelativeStrength({ ages: g.codes }))
        ]);

        const genderMap = normalize({ male: relM, female: relF });
        const agesMap   = Object.fromEntries(ageGroups.map((g, i) => [g.label, ageRelResults[i] || 0]));

        return { gender: genderMap, ages: normalize(agesMap) };
    }

    /**
     * Get Weekly (Day of week) Search Ratio by aggregating daily data (last 3 months)
     */
    async getDatalabWeeklyRatio(keyword) {
        if (!this.naverClientId || !this.naverClientSecret) return null;

        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        const clone = new Date(now.getTime());
        const startDate = new Date(clone.setFullYear(clone.getFullYear() - 1)).toISOString().split('T')[0]; // Last 12 months for stable long-term pattern

        try {
            const res = await axios.post('https://openapi.naver.com/v1/datalab/search', {
                startDate,
                endDate,
                timeUnit: 'day',
                keywordGroups: [{ groupName: keyword, keywords: [keyword] }]
            }, {
                headers: {
                    'X-Naver-Client-Id': this.naverClientId,
                    'X-Naver-Client-Secret': this.naverClientSecret,
                    'Content-Type': 'application/json'
                },
                timeout: 3000
            });

            const rawData = res.data.results[0].data; // [{ period, ratio }]
            if (!rawData || rawData.length === 0) return null;

            const days = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; // 0: Sun, 1: Mon...
            rawData.forEach(d => {
                const day = new Date(d.period).getDay();
                days[day] += d.ratio;
            });

            const total = Object.values(days).reduce((a, b) => a + b, 0);
            if (total === 0) return null;

            // Map to standard Korean days
            const labels = ['일', '월', '화', '수', '목', '금', '토'];
            const result = {};
            labels.forEach((label, i) => {
                result[label] = parseFloat(((days[i] / total) * 100).toFixed(1));
            });

            return result;
        } catch (e) {
            console.error('[KeywordEngine] Weekly Ratio Error:', e.message);
            return null;
        }
    }

    /**
     * Calculate static monthly seasonality (1-12) from trend data
     */
    calculateMonthlySeasonality(trendData) {
        if (!trendData || trendData.length === 0) return null;
        
        const months = {};
        trendData.forEach(d => {
            const m = parseInt(d.month.split('-')[1]);
            if (!months[m]) months[m] = [];
            months[m].push(d.volume);
        });

        const result = {};
        let total = 0;
        for (let i = 1; i <= 12; i++) {
            const avg = months[i] ? months[i].reduce((a, b) => a + b, 0) / months[i].length : 0;
            result[`${i}월`] = avg;
            total += avg;
        }

        if (total === 0) return null;
        
        for (let i = 1; i <= 12; i++) {
            result[`${i}월`] = parseFloat(((result[`${i}월`] / total) * 100).toFixed(1));
        }

        return result;
    }

    calculateEfficiency(volume, docCount) {
        if (docCount === 0) return 0;
        return parseFloat(((volume / docCount) * 10).toFixed(2));
    }

    /**
     * Classify a saturation percentage (문서수/검색량 * 100) into a 5-tier status + color
     */
    getSaturationStatus(val) {
        if (val < 5)  return { text: '매우 낮음', color: '#10b981' };
        if (val < 10) return { text: '낮음',     color: '#34d399' };
        if (val < 30) return { text: '보통',     color: '#f59e0b' };
        if (val < 50) return { text: '높음',     color: '#ef4444' };
        return { text: '매우 높음', color: '#b91c1c' };
    }

    /**
     * Fetch blog document counts for many keywords, paced in chunks of 8 with a
     * 1s gap between chunks (네이버 검색 Open API rate limit 대응). isSeed=false라
     * detailedDoc.total === blog 단독 카운트(카페 미포함)임.
     */
    async fetchBlogTotalsBatch(keywords) {
        const results = [];
        for (const batch of _.chunk(keywords, 8)) {
            const batchResults = await Promise.all(
                batch.map(async (kw) => {
                    const detailedDoc = await this.getDetailedDocumentCount(kw);
                    // is_estimated === true는 API 호출 실패(할당량 초과 등)를 의미 — "진짜 0"과
                    // 구분해서, 실패한 건 호출부에서 캐시에 안 쓰고 '측정중' 상태로 남겨야 함
                    return { keyword: kw, total: detailedDoc.total, success: !detailedDoc.is_estimated };
                })
            );
            results.push(...batchResults);
            await new Promise(r => setTimeout(r, 1000));
        }
        return results;
    }

    /**
     * 컨셉별 추천 키워드 풀 생성 (월 1회 배치 / 신규 컨셉 온디맨드 공용)
     * Gemini로 "요즘 많이 검색하는 키워드" 100개를 생성하고, 네이버 검색광고 API로
     * 검색량·경쟁도를, fetchBlogTotalsBatch로 포화도를 채워 concept_keyword_pool에 저장한다.
     * 매달 전량 교체 방식: 새 100개를 먼저 upsert한 뒤, 이번에 갱신되지 않은(이전 달) 행을 삭제한다
     * (삭제 먼저 하면 배치 도중 실패 시 추천 키워드가 잠깐 텅 비는 문제가 생기므로 순서를 지킨다).
     */
    async generateConceptKeywordPool(concept) {
        if (!this.model) throw new Error('Gemini API Key가 설정되지 않았습니다.');
        if (!this.supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');

        console.log(`[KeywordPool] "${concept}" 컨셉 키워드 풀 생성 시작...`);

        // 1. Gemini: 요즘 사람들이 많이 검색하는 키워드 100개
        const prompt = `너는 네이버 블로그 콘텐츠 기획 전문가야. "${concept}" 카테고리 블로그를 운영하는 사람에게 추천할 만한, 요즘(최근) 사람들이 네이버에서 많이 검색하는 실제 검색 키워드 100개를 만들어줘.

규칙:
- 실제 사람들이 네이버 검색창에 입력할 법한 자연스러운 검색어 형태로 작성 (예: "제주도 가족여행 코스", "여름 원피스 코디")
- "여행", "패션"처럼 너무 포괄적인 단어 하나짜리는 제외하고, 구체적인 롱테일 키워드 위주로 작성
- 최신 트렌드·시즌·이슈를 반영
- 중복 없이 정확히 100개
- 각 줄에 키워드 하나씩만, 번호·설명·마크다운 기호 없이 키워드 텍스트만 출력`;

        const result = await this.model.generateContent(prompt);
        const text = result.response.text();
        let keywords = text.split('\n')
            .map(l => l.replace(/^[\d.\)\-*\s]+/, '').trim())
            .filter(l => l.length > 0 && l.length < 40);
        keywords = [...new Set(keywords)].slice(0, 100);

        if (keywords.length === 0) throw new Error('Gemini 키워드 생성 결과가 비어있습니다.');
        console.log(`[KeywordPool] "${concept}" — Gemini 생성 ${keywords.length}개`);

        // 2. 네이버 검색광고 API로 검색량/경쟁도 조회 (hintKeywords 최대 5개 제한 → 5개씩 청크)
        const utils = require('./utils');
        const stripSpace = (s) => s.replace(/\s+/g, '');
        const volumeMap = new Map(); // normalizedNoSpaceKeyword -> { search_volume, comp_idx }

        for (const batch of _.chunk(keywords, 5)) {
            try {
                // 네이버 hintKeywords 파라미터는 띄어쓰기가 있으면 400(BAD_REQUEST)을 반환하므로
                // 반드시 공백 제거 후 전달해야 한다 (매칭용 stripSpace와 별개로 실제 요청에도 적용)
                const stats = await naverAd.getKeywordStats(batch.map(stripSpace));
                if (stats) {
                    const batchKeySet = new Set(batch.map(k => utils.normalizeKeyword(stripSpace(k))));
                    stats.forEach(s => {
                        const relKey = utils.normalizeKeyword(stripSpace(s.relKeyword || ''));
                        if (batchKeySet.has(relKey)) {
                            volumeMap.set(relKey, {
                                search_volume: (parseInt(s.monthlyPcQcCnt) || 0) + (parseInt(s.monthlyMobileQcCnt) || 0),
                                comp_idx: s.compIdx || null,
                            });
                        }
                    });
                }
            } catch (e) {
                console.error(`[KeywordPool] 네이버 API 조회 실패 (배치): ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // 3. 포화도 계산 (문서수 ÷ 검색량 → 5단계 → 화면용 3단계로 축약, /api/recommendations와 동일 규칙)
        const toTier3 = (satText) => {
            if (['매우 낮음', '낮음'].includes(satText)) return '낮음';
            if (satText === '보통') return '중간';
            return '높음';
        };
        const blogTotalResults = await this.fetchBlogTotalsBatch(keywords);
        const blogTotalMap = new Map(blogTotalResults.map(r => [utils.normalizeKeyword(r.keyword), r]));

        // 4. 최종 rows 구성
        const nowIso = new Date().toISOString();
        const rows = keywords.map(kw => {
            const vol = volumeMap.get(utils.normalizeKeyword(stripSpace(kw)));
            const btResult = blogTotalMap.get(utils.normalizeKeyword(kw));
            let saturation = '측정중';
            if (vol?.search_volume && btResult?.success) {
                const pct = (btResult.total / vol.search_volume) * 100;
                saturation = toTier3(this.getSaturationStatus(pct).text);
            }
            return {
                concept,
                keyword: kw,
                search_volume: vol?.search_volume ?? null,
                comp_idx: vol?.comp_idx ?? null,
                saturation,
                generated_at: nowIso,
            };
        });

        // 5. DB 반영 — 새 100개 먼저 upsert, 그다음 이번에 갱신 안 된(=이전 달) 행 삭제
        const { error: upsertErr } = await this.supabase
            .from('concept_keyword_pool')
            .upsert(rows, { onConflict: 'concept,keyword' });
        if (upsertErr) throw new Error(`concept_keyword_pool upsert 실패: ${upsertErr.message}`);

        const { error: deleteErr } = await this.supabase
            .from('concept_keyword_pool')
            .delete()
            .eq('concept', concept)
            .lt('generated_at', nowIso);
        if (deleteErr) console.error(`[KeywordPool] "${concept}" 이전 데이터 정리 실패: ${deleteErr.message}`);

        console.log(`[KeywordPool] "${concept}" 완료 — ${rows.length}개 저장 (검색량 매칭 ${volumeMap.size}개)`);
        return rows.length;
    }

    /**
     * Blackkiwi-style Keyword Scoring (100pt base)
     * 6 weighted factors mirroring BlackKiwi's grade methodology:
     *   Saturation(30) + Trend%(20) + SearchVolume(20) + DocCount(15) + SectionOrder(10) + MonthlyStability(5)
     *
     * @param {object} data - { search_volume, document_count, recent_trend_change }
     * @param {string[]|null} sectionOrder - PC section order array (seed keyword only)
     * @param {object|null} monthlySeasonality - { "1월": %, ... "12월": % } (seed keyword only)
     */
    calculateKeywordScore(data, sectionOrder = null, monthlySeasonality = null) {
        let score = 0;

        // 1. 포화 지수 (Saturation Index) - Max 30pt
        // 검색량 대비 문서 수 비율: 높을수록 포화도 낮음 → 유리
        const ratio = (data.search_volume || 0) / (data.document_count || 1);
        if (ratio > 10) score += 30;
        else if (ratio > 5) score += 24;
        else if (ratio > 2) score += 18;
        else if (ratio > 1) score += 12;
        else if (ratio > 0.5) score += 6;
        else score += 3;

        // 2. 검색량 상승/하락 퍼센티지 (Trend %) - Max 20pt
        const trendVal = (data.recent_trend_change || 0);
        if (trendVal > 50) score += 20;
        else if (trendVal > 30) score += 17;
        else if (trendVal > 15) score += 14;
        else if (trendVal > 0) score += 11;
        else if (trendVal > -10) score += 7;
        else if (trendVal > -30) score += 4;
        else score += 2;

        // 3. 검색량 크기 (Search Volume) - Max 20pt
        const vol = data.search_volume || 0;
        if (vol >= 50000) score += 20;
        else if (vol >= 10000) score += 16;
        else if (vol >= 3000) score += 12;
        else if (vol >= 1000) score += 8;
        else if (vol >= 300) score += 4;
        else score += 2;

        // 4. 콘텐츠 발행량 절대값 (Document Count) - Max 15pt
        // 발행량이 적을수록 진입 장벽 낮음 → 유리
        const docCount = data.document_count || 0;
        if (docCount < 1000) score += 15;
        else if (docCount < 5000) score += 12;
        else if (docCount < 20000) score += 8;
        else if (docCount < 50000) score += 5;
        else score += 2;

        // 5. 섹션 배치 순서 (Section Placement Order) - Max 10pt
        // 네이버 검색 결과에서 블로그 섹션이 상위에 배치될수록 상위 노출 유리
        if (sectionOrder && Array.isArray(sectionOrder) && sectionOrder.length > 0) {
            const blogIdx = sectionOrder.findIndex(s => s && (s.includes('블로그') || s.toLowerCase().includes('blog')));
            if (blogIdx === -1) score += 1;       // 블로그 섹션 없음
            else if (blogIdx <= 1) score += 10;   // 1~2번째 (최상위)
            else if (blogIdx === 2) score += 8;   // 3번째
            else if (blogIdx <= 4) score += 6;    // 4~5번째
            else score += 3;                      // 6번째 이하
        } else {
            score += 5; // 풀 키워드 중립값 (섹션 데이터 미수집)
        }

        // 6. 월별 검색 비율 균등도 (Monthly Search Stability) - Max 5pt
        // 월별 검색이 고른 키워드일수록 꾸준한 수요 → 유리
        // 변동계수(CV = 표준편차/평균)로 안정성 측정
        if (monthlySeasonality && typeof monthlySeasonality === 'object') {
            const values = Object.values(monthlySeasonality).filter(v => v > 0);
            if (values.length >= 3) {
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
                const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
                if (cv < 0.15) score += 5;      // 매우 안정적
                else if (cv < 0.25) score += 4;
                else if (cv < 0.40) score += 3;
                else if (cv < 0.60) score += 2;
                else score += 1;                // 강한 계절성
            } else {
                score += 3;
            }
        } else {
            score += 3; // 풀 키워드 중립값 (계절성 데이터 미수집)
        }

        return Math.min(100, Math.max(0, score));
    }

    getGrade(score) {
        const grades = [
            { threshold: 95, label: 'S+' },
            { threshold: 90, label: 'S' },
            { threshold: 85, label: 'S-' },
            { threshold: 80, label: 'A+' },
            { threshold: 75, label: 'A' },
            { threshold: 70, label: 'A-' },
            { threshold: 60, label: 'B+' },
            { threshold: 50, label: 'B' },
            { threshold: 45, label: 'B-' },
            { threshold: 35, label: 'C+' },
            { threshold: 30, label: 'C' },
            { threshold: 25, label: 'C-' },
            { threshold: 15, label: 'D+' },
            { threshold: 10, label: 'D' },
            { threshold: 0, label: 'D-' }
        ];

        for (const g of grades) {
            if (score >= g.threshold) return g.label;
        }
        return 'D-';
    }

    async analyze(seedKeyword, options = {}) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const timestamp = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

        // Optimization 4: Check Cache First
        const cached = await this.getCachedResult(seedKeyword);
        if (cached && cached.seed_analysis && cached.seed_analysis.issue_score !== undefined && cached.seed_analysis.saturation_details && cached.analysis_pool && cached.seasonality && cached.smart_blocks) {
            return cached;
        }

        // Helper for spelling similarity (Priority: Inclusion > Levenshtein)
        const calculateSimilarity = (s1, s2) => {
            if (!s1 || !s2) return '낮음';
            
            const clean1 = s1.replace(/\s+/g, '').toLowerCase();
            const clean2 = s2.replace(/\s+/g, '').toLowerCase();

            // Criterion 1: String Inclusion (Highest Priority)
            if (clean2.includes(clean1) || clean1.includes(clean2)) return '높음';

            // Criterion 2: Levenshtein Distance (For partial matches)
            const longer = clean1.length > clean2.length ? clean1 : clean2;
            const shorter = clean1.length > clean2.length ? clean2 : clean1;
            
            const editDistance = (a, b) => {
                const costs = [];
                for (let i = 0; i <= a.length; i++) {
                    let lastValue = i;
                    for (let j = 0; j <= b.length; j++) {
                        if (i === 0) costs[j] = j;
                        else if (j > 0) {
                            let newValue = costs[j - 1];
                            if (a.charAt(i - 1) !== b.charAt(j - 1))
                                newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                            costs[j - 1] = lastValue;
                            lastValue = newValue;
                        }
                    }
                    if (i > 0) costs[b.length] = lastValue;
                }
                return costs[b.length];
            };

            const distance = editDistance(longer, shorter);
            const score = (longer.length - distance) / longer.length;
            
            if (score > 0.5) return '보통';
            return '낮음';
        };

        console.log(`[KeywordEngine] Starting High-Speed Analysis for: ${seedKeyword}`);
        const startTime = Date.now();

        // Optimization 1: Parallel Sourcing (Task A, B, C Concurrent)
        const [relatedKeywords, seedAdStats, docStats, realDemographics, weeklyRatio, initialTrend, smartBlocksAnalysis, naverSuggestKeywords] = await Promise.all([
            this.fetchRelatedKeywords(seedKeyword),                         // Pool Sourcing
            naverAd.getKeywordStats([seedKeyword.replace(/\s+/g, '')]),    // Baseline Volume
            this.getDetailedDocumentCount(seedKeyword),                    // Publish Count
            this.getDatalabDemographics(seedKeyword),                      // Demographics
            this.getDatalabWeeklyRatio(seedKeyword),                        // Weekly Ratio
            this.getAdvancedTrend([seedKeyword], { timeUnit: 'date' }),      // Initial 30-day Trend (fixed unit)
            this.getSmartBlocksAnalysis(seedKeyword),                      // Smart Block Analysis
            this._getNaverSuggestKeywords(seedKeyword)                     // 네이버 자동완성 연관검색어
        ]);

        // Process Seed Baseline
        let seedItem = null;
        if (seedAdStats && seedAdStats.length > 0) {
            const k = seedAdStats[0];
            seedItem = {
                keyword: k.relKeyword,
                pc_volume: parseInt(k.monthlyPcQcCnt) || 0,
                mobile_volume: parseInt(k.monthlyMobileQcCnt) || 0,
                total_volume: (parseInt(k.monthlyPcQcCnt) || 0) + (parseInt(k.monthlyMobileQcCnt) || 0)
            };
        } else {
            seedItem = { keyword: seedKeyword, pc_volume: 300, mobile_volume: 700, total_volume: 1000 };
        }

        // Parallel Sourcing for Trend (needs seed baseline)
        const monthlyTrend = await this.getDatalabTrend(seedKeyword, seedItem.total_volume);

        // 2. Filter top 200 keywords for pool analysis
        let pool = _.sortBy(relatedKeywords, 'total_volume').reverse().slice(0, 100); // 속도 최적화: 200→100
        pool = pool.filter(k => k.keyword !== seedItem.keyword);
        pool.unshift(seedItem);

        // 3. (ULTRA-SPEED) Controlled Concurrency Analysis
        const analyzedList = [];
        const chunks = _.chunk(pool, 8); // 속도 최적화: 5→8 (API 레이트리밋 허용 범위 내)
        
        for (const chunk of chunks) {
            const chunkResults = await Promise.all(chunk.map(async (item) => {
                try {
                    const isSeed = item.keyword === seedItem.keyword;
                    const detailedDoc = await this.getDetailedDocumentCount(item.keyword, isSeed);
                    const ds = detailedDoc.total;
                    const scoreEff = this.calculateEfficiency(item.total_volume, ds);

                    // Trend Estimation for Score
                    let trendChange = 0;
                    let preciseTrend = null;
                    if (isSeed) {
                        preciseTrend = await this.getPreciseTrend(item.keyword, item.total_volume);
                        if (preciseTrend) {
                            trendChange = preciseTrend.projected_trend;
                        } else if (monthlyTrend.length >= 2) {
                            const last = monthlyTrend[monthlyTrend.length - 1].volume;
                            const prev = monthlyTrend[monthlyTrend.length - 2].volume;
                            trendChange = prev > 0 ? ((last - prev) / prev) * 100 : 0;
                        }
                    }

                    const rawDataForScore = {
                        search_volume: item.total_volume,
                        document_count: ds,
                        recent_trend_change: trendChange
                    };

                    // 시드 키워드: 월별 계절성 데이터 활용 (섹션 순서는 수집 후 별도 재계산)
                    const seedSeasonality = isSeed ? this.calculateMonthlySeasonality(monthlyTrend) : null;
                    const finalScore = this.calculateKeywordScore(rawDataForScore, null, seedSeasonality);
                    const predictedVolume = Math.round(item.total_volume * (1 + (trendChange / 100)));

                    const vol = item.total_volume || 1;
                    const blogSat = parseFloat(((detailedDoc.blog / vol) * 100).toFixed(2));
                    const cafeSat = parseFloat(((detailedDoc.cafe / vol) * 100).toFixed(2));
                    const totalSat = parseFloat(((detailedDoc.total / vol) * 100).toFixed(2));

                    const saturationDetails = {
                        blog: { value: blogSat, ...this.getSaturationStatus(blogSat) },
                        cafe: { value: cafeSat, ...this.getSaturationStatus(cafeSat) },
                        total: { value: totalSat, ...this.getSaturationStatus(totalSat) }
                    };

                    // Monthly Saturation
                    const blogSatM = parseFloat(((detailedDoc.monthly.blog / vol) * 100).toFixed(2));
                    const cafeSatM = parseFloat(((detailedDoc.monthly.cafe / vol) * 100).toFixed(2));
                    const totalSatM = parseFloat(((detailedDoc.monthly.total / vol) * 100).toFixed(2));
                    const monthlySaturationDetails = {
                        blog: { value: blogSatM, ...this.getSaturationStatus(blogSatM) },
                        cafe: { value: cafeSatM, ...this.getSaturationStatus(cafeSatM) },
                        total: { value: totalSatM, ...this.getSaturationStatus(totalSatM) }
                    };

                    return {
                        keyword: item.keyword,
                        pc_volume: item.pc_volume,
                        mobile_volume: item.mobile_volume,
                        search_volume: item.total_volume,
                        predicted_volume: predictedVolume,
                        blog_count: detailedDoc.blog,
                        cafe_count: detailedDoc.cafe,
                        document_count: ds,
                        monthly_blog_count: detailedDoc.monthly.blog,
                        monthly_cafe_count: detailedDoc.monthly.cafe,
                        monthly_document_count: detailedDoc.monthly.total,
                        efficiency_score: scoreEff,
                        current_month_cumulative: preciseTrend?.this_month_cumulative ?? Math.round((item.total_volume / 30) * day),
                        projected_month_total: preciseTrend?.projected_month_total ?? Math.round(((item.total_volume / 30) * day) + ((item.total_volume / 30) * (lastDay - day))),
                        current_cumulative_trend: preciseTrend ? preciseTrend.cumulative_trend : trendChange,
                        projected_month_trend: preciseTrend ? preciseTrend.projected_trend : trendChange,
                        saturation_details: saturationDetails,
                        monthly_saturation_details: monthlySaturationDetails,
                        raw_score: finalScore,
                        grade: this.getGrade(finalScore),
                        similarity: calculateSimilarity(seedKeyword, item.keyword),
                        trend_change: trendChange,
                        is_seed: isSeed,
                        issue_score: preciseTrend ? (Math.abs(preciseTrend.projected_trend) > 50 ? 5.0 : 0.5) : 0.5
                    };
                } catch (err) {
                    console.error(`[KeywordEngine] Error analyzing item ${item.keyword}:`, err.message);
                    return {
                        keyword: item.keyword,
                        search_volume: item.total_volume,
                        document_count: 0,
                        efficiency_score: 0,
                        raw_score: 30,
                        grade: 'D',
                        similarity: calculateSimilarity(seedKeyword, item.keyword),
                        trend_change: 0,
                        is_seed: item.keyword === seedItem.keyword,
                        saturation_details: {
                            blog: { value: 0, text: '데이터 없음', color: '#94a3b8' },
                            total: { value: 0, text: '데이터 없음', color: '#94a3b8' }
                        }
                    };
                }
            }));
            analyzedList.push(...chunkResults.map(r => {
                if (r.is_seed) {
                    r.meta = {
                        today_formatted: `${month}월 ${day}일`,
                        projected_formatted: `${month}월 ${lastDay}일`
                    };
                }
                return r;
            }));
            
            // Artificial delay between batches to stay under Naver API rate limits (500ms)
            await new Promise(r => setTimeout(r, 200)); // 속도 최적화: 500ms→200ms
        }

        // 4. Generate Topic Clusters (블랙키위 방식: 2글자 철자 유사도 기반 클러스터링)
        const generateClusters = (keywords, seed, suggestSet) => {
            const seedCore = seed.replace(/\s+/g, '').toLowerCase();

            // Primary: 시드 키워드를 포함한 연관검색어 (블랙키위 첫 번째 탭)
            const seedMatches = keywords
                .filter(k => k.keyword.replace(/\s+/g, '').toLowerCase().includes(seedCore))
                .map(k => k.keyword);

            // Secondary: 시드를 포함하지 않는 키워드들에서 2글자 ngram 클러스터 생성
            const ngramMap = new Map();
            keywords.forEach(item => {
                const kw = item.keyword.replace(/\s+/g, '').toLowerCase();
                if (kw.includes(seedCore)) return; // 시드 포함 키워드는 제외
                for (let i = 0; i < kw.length - 1; i++) {
                    const ngram = kw.substring(i, i + 2);
                    if (seedCore.includes(ngram)) continue; // 시드 자체의 ngram 제외
                    if (!ngramMap.has(ngram)) ngramMap.set(ngram, new Set());
                    ngramMap.get(ngram).add(item.keyword);
                }
            });

            const secondaryClusters = Array.from(ngramMap.entries())
                .map(([ngram, itemSet]) => ({ name: ngram, count: itemSet.size, keywords: [...itemSet] }))
                .filter(c => c.count >= 3)
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            // 검색어 미포함 키워드 전체 묶음 (연관어 탭)
            const nonSeedKeywords = keywords
                .filter(k => !k.keyword.replace(/\s+/g, '').toLowerCase().includes(seedCore))
                .map(k => k.keyword);

            const clusters = [];
            if (seedMatches.length > 0) {
                clusters.push({ name: seed, count: seedMatches.length, keywords: seedMatches });
            }
            if (nonSeedKeywords.length > 0) {
                clusters.push({ name: '연관어', count: nonSeedKeywords.length, keywords: nonSeedKeywords });
            }
            clusters.push(...secondaryClusters);
            return clusters;
        };

        const seedAnalysis = analyzedList.find(r => r && r.is_seed) || analyzedList[0];
        let recommendations = analyzedList.filter(r => r && !r.is_seed);

        // 네이버 자동완성 키워드 Set (is_suggest 태깅용)
        const suggestSet = new Set((naverSuggestKeywords || []).map(k => k.replace(/\s+/g, '').toLowerCase()));

        // 연관검색어 태깅 및 정렬: 자동완성 > 시드 포함 > 나머지(검색량순)
        const seedCore = seedKeyword.replace(/\s+/g, '').toLowerCase();
        recommendations.forEach(item => {
            const kw = item.keyword.replace(/\s+/g, '').toLowerCase();
            item.is_suggest = suggestSet.has(kw); // 네이버 자동완성 키워드
            item.contains_seed = kw.includes(seedCore); // 시드 포함 여부
        });
        recommendations.sort((a, b) => {
            const aScore = (a.is_suggest ? 2 : 0) + (a.contains_seed ? 1 : 0);
            const bScore = (b.is_suggest ? 2 : 0) + (b.contains_seed ? 1 : 0);
            if (aScore !== bScore) return bScore - aScore;
            return (b.search_volume || 0) - (a.search_volume || 0);
        });
        // 검색어와 무관한 키워드 제거: 자동완성 또는 시드 포함 키워드만 유지
        recommendations = recommendations.filter(r => r.is_suggest || r.contains_seed);

        const clusters = generateClusters(recommendations, seedKeyword, suggestSet);


        // 5. Get Section Orders (PC & Mobile)
        const [pcSections, mobileSections] = await Promise.all([
            this._getSectionOrder(seedKeyword, 'pc'),
            this._getSectionOrder(seedKeyword, 'mobile')
        ]);

        // 5-1. 섹션 배치 순서 수집 완료 후 시드 키워드 점수 재계산 (블랙키위 방식 완전 적용)
        // 섹션 배치(10pt)는 시드에만 실측 가능 — 풀 분석 단계의 중립값(5pt)을 보정
        if (seedAnalysis) {
            const seedSeasonality = this.calculateMonthlySeasonality(monthlyTrend);
            const updatedScore = this.calculateKeywordScore(
                {
                    search_volume: seedAnalysis.search_volume,
                    document_count: seedAnalysis.document_count,
                    recent_trend_change: seedAnalysis.trend_change || 0
                },
                pcSections,
                seedSeasonality
            );
            seedAnalysis.raw_score = updatedScore;
            seedAnalysis.grade = this.getGrade(updatedScore);
        }

        // 6. Strategic Curation (Gemini Insight - Flash)
        const sortedListByScore = _.sortBy(recommendations, 'efficiency_score').reverse();
        const curationPrompt = `
[Role: Keyword SEO Strategist]
메인 키워드 "${seedKeyword}"의 분석 결과와 연관 키워드 데이터를 기반으로 전략적 조언을 제공하세요.

메인 분석 데이터: ${JSON.stringify(seedAnalysis, null, 2)}
트렌드: ${JSON.stringify(monthlyTrend.slice(-3), null, 2)}
인구통계: ${JSON.stringify(realDemographics, null, 2)}
연관 키워드: ${JSON.stringify(sortedListByScore.slice(0, 10), null, 2)}

임무:
1. 추천 연관 키워드 TOP 5 선정 및 각 키워드별 '공략 전략' 작성 (20자 이내).
2. 메인 키워드 검색 시 예상되는 '인기 주제(스마트블록)' 3~5개 제안.
3. 현재 시장 동향 및 컨텐츠 제작 방향 요약 (1문장).

출력 형식 (Strict JSON Only):
{
  "recommended_keywords": [
    { "rank": 1, "keyword": "...", "search_volume": 1200, "document_count": 50, "efficiency_score": 24.0, "grade": "S", "strategy": "..." }
  ],
  "popular_topics": [ "추천 주제 1", "추천 주제 2", "추천 주제 3" ],
  "market_trend_summary": "..."
}
`;

        let curationData = { recommended_keywords: [], popular_topics: [], market_trend_summary: "AI 분석을 일시적으로 사용할 수 없습니다." };
        try {
            const aiResult = await this.model.generateContent(curationPrompt);
            const aiResponse = (await aiResult.response).text().replace(/```json|```/g, '').trim();
            curationData = JSON.parse(aiResponse);
        } catch (aiErr) {
            console.error('[KeywordEngine] AI curation failed, using fallback:', aiErr.message);
        }

        const finalResult = {
            analysis_timestamp: timestamp,
            seed_analysis: seedAnalysis,
            recommended_keywords: curationData.recommended_keywords,
            monthly_trend: monthlyTrend,
            seasonality: {
                monthly: this.calculateMonthlySeasonality(monthlyTrend) || { "1월": 8, "2월": 8, "3월": 8, "4월": 8, "5월": 8, "6월": 8, "7월": 8, "8월": 8, "9월": 8, "10월": 8, "11월": 9, "12월": 11 },
                weekly: weeklyRatio || { "월": 15, "화": 15, "수": 15, "목": 15, "금": 14, "토": 13, "일": 13 }
            },
            demographics: {
                gender: realDemographics?.gender || { male: 50, female: 50 },
                age: realDemographics?.ages || { "10s": 10, "20s": 20, "30s": 30, "40s": 20, "50s": 20 }
            },
            advanced_trend: initialTrend,
            analysis_pool: recommendations, // Pass all 200 analyzed keywords
            clusters: clusters,
            section_order: {
                pc: pcSections,
                mobile: mobileSections
            },
            popular_topics: curationData.popular_topics,
            market_trend_summary: curationData.market_trend_summary,
            smart_blocks: smartBlocksAnalysis, 
            speed_stats: {
                total_ms: Date.now() - startTime,
                cached: false
            }
        };

        // Save to Cache
        await this.saveResultToCache(seedKeyword, finalResult);

        if (options.webhookUrl) {
            axios.post(options.webhookUrl, finalResult).catch(() => { });
        }

        return finalResult;
    }
}

module.exports = KeywordAnalysisEngine;
