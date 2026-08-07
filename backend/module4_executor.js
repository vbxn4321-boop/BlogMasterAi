const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const utils = require('./utils');
const config = require('./config');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function downloadToTemp(url) {
    return new Promise((resolve) => {
        const ext = url.split('?')[0].split('.').pop().split('/').pop() || 'jpg';
        const tmpPath = path.join(os.tmpdir(), `footer_${Date.now()}.${ext}`);
        const file = fs.createWriteStream(tmpPath);
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(tmpPath); });
        }).on('error', (err) => {
            console.error(`[Module 4] Image download error: ${err.message}`);
            fs.unlink(tmpPath, () => {});
            resolve(null);
        });
    });
}

/**
 * 모듈 4: 실행 에이전트 (네이버 블로그 자동화)
 * 역할: 브라우저 자동화를 통해 콘텐츠 게시
 */
class ExecutionAgent {
    constructor() {
        this.browser = null;
        this.page = null;
        this.businessShown = { map: false, cta: false };
    }

    /**
     * 네이버 스마트에디터의 실제 작업 프레임(mainFrame)을 가져옵니다.
     * 모든 에디터 내부 요소(발행 버튼 포함)는 이 프레임 안에 있습니다.
     */
    _getEditorFrame() {
        const frames = this.page.frames();
        const mainFrame = frames.find(f => f.name() === 'mainFrame' || f.url().includes('PostWriteForm.naver'));
        return mainFrame || this.page;
    }

    async getCookies() {
        if (!this.page) return null;
        try {
            return await this.page.cookies();
        } catch (e) {
            return null;
        }
    }

    async launch(id, pw, onProgress = null, headless = false, proxy = null, savedCookies = null) {
        this.naverId = id;
        if (onProgress) onProgress('브라우저 실행', 82, '크롬 브라우저를 준비하고 있습니다...');

        const cleanId = id.split('@')[0];
        const userDataDir = path.join(__dirname, 'user_data', cleanId);
        console.log(`[Module 4] [${new Date().toISOString()}] Step 4.1: Initializing puppeteer launch for ${cleanId} (Session: ${userDataDir})`);

        const isProduction = process.env.NODE_ENV === 'production';
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-notifications',
            '--disable-extensions',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--lang=ko-KR,ko'
        ];

        if (proxy?.host && proxy?.port) {
            const proxyScheme = proxy.type === 'socks5' ? 'socks5' : 'http';
            args.push(`--proxy-server=${proxyScheme}://${proxy.host}:${proxy.port}`);
            console.log(`[Module 4] Proxy applied: ${proxyScheme}://${proxy.host}:${proxy.port} (auth: ${proxy.username ? 'yes' : 'no'})`);
        }

        const launchOptions = {
            headless: isProduction ? 'new' : false,
            userDataDir: userDataDir, // 로그인 세션 유지
            args,
            defaultViewport: { width: 1280, height: 960 },
            timeout: 30000
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        try {
            console.log(`[Module 4] [${new Date().toISOString()}] Step 4.1.1: Calling puppeteer.launch (headless=${launchOptions.headless})...`);
            this.browser = await puppeteer.launch(launchOptions);
            console.log(`[Module 4] [${new Date().toISOString()}] Step 4.1.2: Browser launched.`);

            console.log(`[Module 4] [${new Date().toISOString()}] Step 4.1.3: Creating new page...`);
            this.page = await this.browser.newPage();

            if (proxy?.username && proxy?.password) {
                await this.page.authenticate({ username: proxy.username, password: proxy.password });
                console.log(`[Module 4] Proxy authentication set for user: ${proxy.username}`);
            }

            try {
                const ipCheckPage = await this.browser.newPage();
                if (proxy?.username && proxy?.password) {
                    await ipCheckPage.authenticate({ username: proxy.username, password: proxy.password });
                }
                await ipCheckPage.goto('https://api.ipify.org?format=json', { waitUntil: 'networkidle2', timeout: 10000 });
                const body = await ipCheckPage.evaluate(() => document.body.innerText);
                const currentIp = JSON.parse(body).ip;
                const ipLabel = proxy?.host ? `${currentIp} (프록시 적용)` : `${currentIp} (직접 연결)`;
                console.log(`[Module 4] ✅ Current outbound IP: ${ipLabel}`);
                if (onProgress) onProgress('IP 확인', 84, `발행 IP: ${ipLabel}`);
                await ipCheckPage.close();
            } catch (ipErr) {
                console.warn(`[Module 4] IP check failed: ${ipErr.message}`);
                if (onProgress) onProgress('IP 확인', 84, 'IP 확인 실패 (발행은 계속 진행)');
            }

            console.log(`[Module 4] [${new Date().toISOString()}] Step 4.1.4: New page created.`);
            await this.page.setViewport({ width: 1280, height: 900 });
        } catch (launchError) {
            console.error(`[Module 4] [${new Date().toISOString()}] Puppeteer launch CRITICAL failure: ${launchError.message}`);
            throw new Error(`브라우저 실행 실패: ${launchError.message} (서버 리소스 부족 가능성)`);
        }

        try {
            // 1. 저장된 쿠키가 있으면 먼저 주입하여 로그인 시도
            if (savedCookies && savedCookies.length > 0) {
                console.log(`[Module 4] Attempting session restore with ${savedCookies.length} saved cookies...`);
                if (onProgress) onProgress('세션 복원', 83, '저장된 로그인 세션을 복원하고 있습니다...');
                try {
                    await this.page.goto('https://www.naver.com', { waitUntil: 'networkidle2', timeout: 15000 });
                    await this.page.setCookie(...savedCookies);
                    await this.page.goto('https://www.naver.com', { waitUntil: 'networkidle2', timeout: 15000 });
                    const cookieLoginOk = await this.page.evaluate(() => {
                        return !!document.querySelector('.gnb_my_interface') || !!document.querySelector('#gnb_my_interface') || !!document.querySelector('.MyView-module__my_naver___MNPe_');
                    });
                    if (cookieLoginOk) {
                        console.log('[Module 4] ✅ Session restored successfully via saved cookies. Skipping login.');
                        if (onProgress) onProgress('로그인 확인', 85, '저장된 세션으로 로그인되었습니다.');
                        return true;
                    }
                    console.log('[Module 4] ⚠️ Saved cookies are expired or invalid. Proceeding with credentials login.');
                } catch (cookieErr) {
                    console.warn(`[Module 4] Cookie restore failed: ${cookieErr.message}. Proceeding with credentials login.`);
                }
            }

            await this.page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle2' });

            // 2. userDataDir 세션으로 이미 로그인되어 있는지 확인
            const currentUrl = this.page.url();
            const isLoggedIn = !currentUrl.includes('nidlogin.login') || await this.page.$('.gnb_my_interface') !== null || await this.page.$('#gnb_my_interface') !== null;

            if (isLoggedIn) {
                console.log('[Module 4] Already logged in via session. Skipping credentials step.');
                if (onProgress) onProgress('로그인 확인', 85, '기존 세션으로 로그인되었습니다.');
                return true;
            }

            if (onProgress) onProgress('로그인 시작', 86, '아이디/비밀번호를 입력합니다...');
            await utils.randomDelay(1000, 2000);

            // 2. ID/PW 입력 (문자열 보장 및 빈 값 체크)
            const safeId = String(id || '').trim();
            const safePw = String(pw || '').trim();

            if (!safeId || !safePw) {
                throw new Error("네이버 아이디 또는 비밀번호가 설정되지 않았습니다. .env 파일을 확인해 주세요.");
            }

            await this.page.click('#id');
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('a');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');
            await this.page.type('#id', safeId, { delay: 50 });

            await this.page.click('#pw');
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('a');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Backspace');
            await this.page.type('#pw', safePw, { delay: 50 });

            await utils.randomDelay(500, 1000);
            await this.page.click('.btn_login');

            // 3. 페이지 이동 또는 캡차 대기
            console.log('[Module 4] Waiting for login response...');
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
                console.log('[Module 4] Login navigation delayed - checking status.');
            });
            await utils.randomDelay(500, 1000);

            // 여전히 로그인 페이지에 있거나 에러가 있는지 확인
            const isStillOnLogin = this.page.url().includes('nidlogin.login') || this.page.url().includes('login.nhn');
            if (isStillOnLogin) {
                const loginStatus = await this.page.evaluate(() => {
                    const err = document.querySelector('.error_message');
                    const captcha = document.querySelector('#captcha') || document.querySelector('.captcha_wrap');
                    return {
                        errorMsg: err ? err.innerText : null,
                        hasCaptcha: !!captcha || document.body.innerText.includes('로봇')
                    };
                });

                if (loginStatus.hasCaptcha) {
                    console.log('[Module 4] ⚠️ Captcha detected! Waiting for manual user input (up to 3 mins)...');
                    if (onProgress) onProgress('보안 확인', 83, '로봇 방지(캡차)가 감지되었습니다. 직접 입력해 주세요! (3분 대기)');

                    await this.page.waitForFunction(() => !window.location.href.includes('nidlogin.login'), { timeout: 180000 }).catch(() => {
                        throw new Error('캡차 입력 시간 초과 (3분)');
                    });
                } else if (loginStatus.errorMsg) {
                    // Caps Lock 경고는 단순 안내일 수 있으므로 로그만 남기고 일단 진행 시도
                    if (loginStatus.errorMsg.includes('Caps Lock')) {
                        console.warn(`[Module 4] Login Warning: ${loginStatus.errorMsg.trim()}`);
                        // 한 번 더 클릭 시도
                        await this.page.click('.btn_login').catch(() => {});
                        await utils.randomDelay(3000, 5000);
                        if (this.page.url().includes('nidlogin.login')) {
                            throw new Error(`네이버 로그인 실패 (Caps Lock 영향 가능성): ${loginStatus.errorMsg}`);
                        }
                    } else {
                        throw new Error(`네이버 로그인 실패: ${loginStatus.errorMsg}`);
                    }
                }
            }

            console.log('[Module 4] Login Successful');
            return true;
        } catch (e) {
            console.error(`[Module 4] Login error: ${e.message}`);
            throw e;
        }
    }

    async prepareEditor(onProgress = null) {
        if (!this.page) throw new Error("Browser not launched");
        const blogId = this.naverId?.split('@')[0] || process.env.NAVER_ID;
        const writeUrl = config.naver.writeUrl(blogId);
        console.log(`[Module 4] Navigating to Editor for ${blogId}: ${writeUrl}`);

        if (onProgress) await onProgress('에디터 접속', 85, '스마트에디터 페이지로 이동하고 있습니다...');
        await this.page.goto(writeUrl, { waitUntil: 'networkidle2' });
        if (onProgress) await onProgress('에디터 접속', 86, '에디터 구성 요소를 불러오는 중입니다 (약 10초 소요)...');

        // ─────────────────────────────────────────────────────────────────
        // "작성 중인 글이 있습니다" 팝업 처리
        // 팝업은 페이지 로딩과 함께 즉시 나타나므로, 에디터 로딩 대기 전 구간을
        // 500ms 간격 watcher로 감시하여 page.mouse.click() (실좌표 클릭)으로 처리.
        // DevTools 확인 선택자: .se-popup-alert-confirm .se-popup-button-cancel
        // ─────────────────────────────────────────────────────────────────
        let popupDismissed = false;
        let watcherBusy = false;

        // 메인 페이지 또는 #mainFrame 안에서 팝업 취소 버튼을 찾아 mouse.click() 으로 클릭
        const tryClickCancelBtn = async () => {
            // 시도 1: 메인 페이지 직접 검색 (SE ONE, 프레임 없음)
            let btn = await this.page.$('.se-popup-alert-confirm .se-popup-button-cancel').catch(() => null);
            let box = btn ? await btn.boundingBox().catch(() => null) : null;

            // 시도 2: #mainFrame 내부 검색 (iframe 안에 에디터가 있는 구조)
            if (!box || !box.width) {
                try {
                    const frameEl = await this.page.$('#mainFrame');
                    if (frameEl) {
                        const frame = await frameEl.contentFrame();
                        if (frame) {
                            btn = await frame.$('.se-popup-alert-confirm .se-popup-button-cancel').catch(() => null);
                            box = btn ? await btn.boundingBox().catch(() => null) : null;
                        }
                    }
                } catch (_) { }
            }

            if (btn && box && box.width > 0 && box.height > 0) {
                await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                return true;
            }
            return false;
        };

        const popupWatcher = setInterval(async () => {
            if (popupDismissed || watcherBusy) return;
            watcherBusy = true;
            try {
                const clicked = await tryClickCancelBtn();
                if (clicked) {
                    popupDismissed = true;
                    console.log('[Module 4] [Watcher] 취소 버튼 클릭 성공 (mouse.click)');
                }
            } catch (_) { }
            watcherBusy = false;
        }, 500);

        // 에디터 준비 감지: .se-canvas 또는 .se-main-container 가 나타나는 순간 진행
        // 고정 대기(10~13초) 대신 실제 준비 완료 시점을 감지해 평균 6~8초 단축, 최대 20초 타임아웃
        const waitForEditor = () => new Promise(resolve => {
            let resolved = false;
            const done = (reason) => {
                if (resolved) return;
                resolved = true;
                clearInterval(pollInterval);
                clearTimeout(maxTimer);
                resolve(reason);
            };

            const poll = async () => {
                if (resolved) return;
                try {
                    const seOne = await this.page.$('.se-main-container').catch(() => null);
                    if (seOne) { done('se-one'); return; }

                    const frameEl = await this.page.$('#mainFrame').catch(() => null);
                    if (frameEl) {
                        const frame = await frameEl.contentFrame().catch(() => null);
                        if (frame) {
                            const canvas = await frame.$('.se-canvas').catch(() => null);
                            if (canvas) { done('mainframe'); return; }
                        }
                    }
                } catch (_) { }
            };

            const pollInterval = setInterval(poll, 300);
            const maxTimer = setTimeout(() => done('timeout'), 20000);
            poll(); // 즉시 첫 체크
        });

        try {
            const reason = await waitForEditor();
            console.log(`[Module 4] 에디터 준비 완료 (${reason})`);
        } finally {
            clearInterval(popupWatcher);
        }

        // watcher 종료 후에도 팝업이 남아있으면 마지막으로 한 번 더 시도
        if (!popupDismissed) {
            try {
                const clicked = await tryClickCancelBtn();
                if (clicked) {
                    console.log('[Module 4] [Final] 취소 버튼 최종 클릭');
                }
            } catch (_) { }
        }
        await utils.randomDelay(800, 1000);

        const frame = await utils.getSeFrame(this.page).catch(() => null);
        if (!frame) {
            const errorTimestamp = Date.now();
            const debugPath = path.join(process.cwd(), 'logs', `frame_error_${errorTimestamp}.png`);
            await this.page.screenshot({ path: debugPath }).catch(() => { });
            console.error(`[Module 4] [${new Date().toISOString()}] CRITICAL: Failed to acquire SmartEditor frame. Screenshot saved to: ${debugPath}`);

            const allFrames = this.page.frames();
            console.log(`[Module 4] Current page has ${allFrames.length} frames.`);
            allFrames.forEach((f, idx) => console.log(`[Module 4] Frame ${idx}: ${f.url()} (Name: ${f.name()})`));

            throw new Error(`Failed to acquire SmartEditor frame (Is a popup still blocking?) - Check logs/frame_error_${errorTimestamp}.png`);
        }
        return frame;
    }

    async init(page) {
        this.page = page;
    }

    async close() {
        if (this.browser) {
            console.log('[Module 4] Closing browser...');
            await this.browser.close().catch(() => { });
            this.browser = null;
            this.page = null;
        }
    }

    async execute(postData, assetReport, business = {}, onProgress = null) {
        if (!this.page) throw new Error("Browser page not initialized");
        const frame = await utils.getSeFrame(this.page);
        if (!frame) throw new Error("Naver Editor frame not found");

        if (onProgress) await onProgress('원고 업로드', 88, '제목을 입력하고 있습니다...');

        console.log(`[Module 4] Starting execution for: ${postData.title}`);

        // 브라우저 렉(지연)을 방지하기 위해 텍스트를 나누어서 입력하도록 돕는 함수
        const typeText = async (text) => {
            if (!text) return;
            // 연속된 빈 줄을 최대 1개로 압축 (\n\n\n → \n\n)
            const normalized = text.replace(/\n{3,}/g, '\n\n');
            const chunks = normalized.split('\n');
            for (let i = 0; i < chunks.length; i++) {
                await this.page.keyboard.type(chunks[i]);
                if (i < chunks.length - 1) {
                    await this.page.keyboard.press('Enter');
                    await utils.randomDelay(200, 400);
                }
            }
        };

        const pressEnter = async (count = 1) => {
            for (let i = 0; i < count; i++) {
                await this.page.keyboard.press('Enter');
                await utils.randomDelay(300, 500);
            }
        };

        // 1. 제목 설정
        const titleSelector = '.se-ff-nanumgothic.se-fs15, .se-placeholder, [placeholder="제목"]';
        const titleTarget = await frame.waitForSelector(titleSelector, { visible: true });
        await titleTarget.click();
        await utils.randomDelay(500, 1000);
        await this.page.keyboard.type(postData.title);
        await pressEnter(1);

        // 2. 블록 분석
        const blocks = this._parseBlocks(postData.content, assetReport, business);
        console.log(`[Module 4] Parsed ${blocks.length} content blocks.`);

        // 3. 블록 처리 (본문 입력)
        let footerInserted = false;
        let processedCount = 0;
        for (const block of blocks) {
            processedCount++;
            const progressPercent = 88 + Math.floor((processedCount / blocks.length) * 5); // 88% to 93%

            console.log(`[Module 4] Processing block ${processedCount}/${blocks.length}: ${block.type}`);

            if (block.type === 'text') {
                if (onProgress && processedCount % 3 === 0) {
                    await onProgress('원고 업로드', progressPercent, `본문 텍스트 입력 중... (${processedCount}/${blocks.length})`);
                }
                await typeText(block.content);
            } else if (block.type === 'bold') {
                await typeText(block.content);
                await this.page.keyboard.down('Shift');
                for (let i = 0; i < block.content.length; i++) {
                    await this.page.keyboard.press('ArrowLeft');
                    await utils.randomDelay(10, 30);
                }
                await this.page.keyboard.up('Shift');
                await utils.randomDelay(300, 500);
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('b');
                await this.page.keyboard.up('Control');
                await utils.randomDelay(400, 600);
                await this.page.keyboard.press('ArrowRight');
                await utils.randomDelay(100, 200);
                // 볼드 모드가 켜진 채로 남아있으면 Ctrl+B로 OFF
                const isBoldOn = await frame.evaluate(() => document.queryCommandState('bold')).catch(() => false);
                if (isBoldOn) {
                    await this.page.keyboard.down('Control');
                    await this.page.keyboard.press('b');
                    await this.page.keyboard.up('Control');
                    await utils.randomDelay(100, 200);
                }
            } else if (block.type === 'image') {
                const localPath = (assetReport.images && assetReport.images[block.id - 1]) ||
                    (assetReport.details && assetReport.details[block.id - 1]?.path);

                if (localPath) {
                    // media_meta가 있으면 해당 파일의 타입 확인, 없으면 확장자로 판별
                    const meta = assetReport.media_meta && assetReport.media_meta.find(m => m.path === localPath);
                    const isVideo = meta ? meta.mediaType === 'video' : /\.(mp4|mov|avi|webm)$/i.test(localPath);

                    if (isVideo) {
                        if (onProgress) await onProgress('원고 업로드', progressPercent, `동영상 업로드 중... (${processedCount}/${blocks.length})`);
                        console.log(`[Module 4] Uploading video: ${localPath}`);
                        // 동영상 제목: meta에 description이 있으면 우선 사용, 없으면 포스트 제목
                        const videoTitle = meta?.description || postData.title || path.basename(localPath, path.extname(localPath));
                        await this._uploadVideo(frame, localPath, pressEnter, videoTitle);
                    } else {
                        if (onProgress) await onProgress('원고 업로드', progressPercent, `이미지 업로드 중... (${processedCount}/${blocks.length})`);
                        console.log(`[Module 4] Uploading content image: ${localPath}`);
                        const links = business.image_links || {};
                        const link = links[block.id] || links[`anchor${block.id}`];
                        await this._uploadImageWithRetryAndLink(frame, localPath, link, pressEnter);
                    }
                }
            } else if (block.type === 'map' || block.type === 'cta_banner') {
                if (onProgress) await onProgress('원고 업로드', progressPercent, `비즈니스 모듈(지도/배너) 삽입 중...`);
                // 설정된 순서를 맞추기 위한 비즈니스 모듈 (배너/지도 등) 통합 삽입
                if (!footerInserted && business.footer_components && business.footer_components.length > 0) {
                    console.log(`[Module 4] Triggering Footer System insertion at block ${processedCount}`);
                    await this._insertFooterSystem(frame, business.footer_components, typeText, pressEnter);
                    footerInserted = true;
                    this.businessShown.map = true;
                    this.businessShown.cta = true;
                } else if (!footerInserted) {
                    console.log(`[Module 4] Fallback to individual business tags`);
                    if (block.type === 'map' && business.map_address && !this.businessShown.map) {
                        await this._insertMap(frame, business.map_address);
                        this.businessShown.map = true;
                    } else if (block.type === 'cta_banner' && !this.businessShown.cta) {
                        if (business.cta_image_url) {
                            await this._insertImageModule(frame, business.cta_image_url, business.phone || business.kakao_url);
                            this.businessShown.cta = true;
                        }
                    }
                }
            } else if (block.type.startsWith('quote_')) {
                console.log(`[Module 4] Inserting quote block: ${block.type}`);
                await this._insertQuote(frame, block, typeText, pressEnter);
            }
        }

        // 4. 최종 하단 푸터 삽입 (태그가 지정된 위치에 발견되지 않았을 때 대비)
        if (!footerInserted) {
            if (business.footer_components && business.footer_components.length > 0) {
                await this._insertFooterSystem(frame, business.footer_components, typeText, pressEnter);
            }
            if (business.map_address && !this.businessShown.map) {
                console.log(`[Module 4] Map address provided but not shown in content. Inserting at end.`);
                await pressEnter(2);
                await this._insertMap(frame, business.map_address);
                this.businessShown.map = true;
            }
            if (business.footer_text) {
                await pressEnter(2);
                await typeText(business.footer_text);
            }
        }

        // 5. 해시태그 입력 (사용자 요청으로 제거: 본문에만 텍스트로 삽입됨)
        /*
        if (postData.hashtags && postData.hashtags.length > 0) {
            console.log(`[Module 4] Entering ${postData.hashtags.length} hashtags...`);
            const ti = await frame.waitForSelector('.se-tag-input, input[placeholder*="\uD0DC\uADF8"], .se-tag-editor-input', { visible: true, timeout: 10000 }).catch(() => null);
            if (ti) {
                await ti.click();
                await utils.randomDelay(1000, 1500);
                for (const t of postData.hashtags) {
                    const tagText = t.replace('#', '').trim();
                    if (!tagText) continue;
                    await typeText(tagText);
                    await this.page.keyboard.press('Enter');
                    await utils.randomDelay(400, 800);
                }
            }
        }
        */
        console.log('\n[OK] POST PREPARATION COMPLETE.');
    }

    // ─────────────────────────────────────────────────────────────────────
    //  publish() — 진입점: 즉시발행 / 예약발행 분기
    // ─────────────────────────────────────────────────────────────────────
    async publish(options = {}) {
        fs.appendFileSync(path.join(process.cwd(), 'logs', 'debug_data.txt'), `[${new Date().toISOString()}] Module 4 Executor received: ${JSON.stringify(options)}\n`);
        console.log(`[Module 4] Publish method called with options:`, JSON.stringify(options));
        if (!this.page) throw new Error("Browser not initialized");

        const isScheduled = options.scheduled_at && options.scheduled_at !== 'null';

        if (isScheduled) {
            console.log('[Module 4] 📅 예약 발행 모드로 실행합니다.');
            return await this._publishScheduled(options);
        } else {
            console.log('[Module 4] ⚡ 즉시 발행 모드로 실행합니다.');
            return await this._publishImmediate(options);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  _publishImmediate() — 즉시 발행
    //  단계: 사이드바 정리 → 우측상단 발행버튼 클릭 → 패널 대기
    //       → 공개설정 → 최종 발행버튼 클릭 → URL 검증
    // ─────────────────────────────────────────────────────────────────────
    async _publishImmediate(options = {}) {
        console.log(`[Module 4] [즉시발행] 수신된 옵션: ${JSON.stringify(options)}`);
        console.log('[Module 4] [즉시발행] Starting...');
        try {
            // ── 0. 방해 요소 닫기 ──────────────────────────────────────
            await this._closeSidebars();
            await utils.randomDelay(1000, 1500);

            // ── 1. 우측 상단 발행 버튼 클릭 (패널 열기) ────────────────
            await this._clickTopPublishButton();
            console.log('[Module 4] [즉시발행] 패널 열림 대기 중 (3초)...');
            await utils.randomDelay(3000, 3500);

            // ── 2. 상세 설정 자동화 ─────────────────────────────
            // 2. 패널 상세 설정 통합 (공개설정, 카테고리, 주제)
            const visibility = options.visibility || 'all';
            await this._ensurePublishPanelOpen();
            await this._setVisibility(visibility, options.category_id, options.topic_id, options.category_name);
            // 주제 팝업 확인 클릭 후 패널 재렌더링이 완전히 완료될 때까지 충분히 대기
            // (너무 빨리 _ensurePublishPanelOpen 호출 시 리렌더링 중 패널 미탐지 → 패널 재오픈 → 설정 초기화)
            await utils.randomDelay(3000, 4000);

            // 2.4. 댓글/공감 등 상호작용 설정
            await this._ensurePublishPanelOpen();
            await this._setInteractionSettings(options);
            await utils.randomDelay(1000, 1500);

            // ── 3. 최종 "✓ 발행" 버튼 클릭 ────────────────────────────
            console.log('[Module 4] [즉시발행] 최종 발행 버튼 클릭 시도...');
            const success = await this._clickImmediateConfirmButton();
            if (success) {
                console.log('[Module 4] [즉시발행] ✅ 최종 발행 버튼 클릭 성공!');
            } else {
                this._logDetail('[즉시발행] ❌ 최종 발행 버튼 클릭 실패');
                throw new Error("최종 발행 버튼 클릭 실패");
            }

            // ── 4. 발행 완료 대기 및 URL 확인 ─────────────────────────
            await utils.randomDelay(4000, 5000);
            const finalUrl = this.page.url();
            const isSuccess = !finalUrl.includes('Redirect=Write') && !finalUrl.includes('write.blog.naver.com');
            console.log(`[Module 4] [즉시발행] 최종 URL: ${finalUrl} | 성공여부: ${isSuccess}`);
            return finalUrl;

        } catch (e) {
            console.error(`[Module 4] [즉시발행] 오류: ${e.message}`);
            await this.page.screenshot({ path: path.join(process.cwd(), 'logs', `immediate_error_${Date.now()}.png`) }).catch(() => { });
            throw e;
        }
    }

    async _publishScheduled(options = {}) {
        this._logDetail(`[예약발행] 수신된 옵션: ${JSON.stringify(options)}`);
        this._logDetail('[예약발행] 시작...');
        try {
            // ── 0. 방해 요소 닫기 ──────────────────────────────────────
            await this._closeSidebars();
            await utils.randomDelay(1000, 1500);

            // ── 1. 우측 상단 발행 버튼 클릭 (패널 열기) ────────────────
            await this._clickTopPublishButton();
            console.log('[Module 4] [예약발행] 패널 열림 대기 중 (3초)...');
            await utils.randomDelay(3000, 3500);

            // ── 2. "예약" 라디오 버튼 클릭 ────────────────────────────
            console.log('[Module 4] [예약발행] 예약 라디오 버튼 클릭 시도...');
            const reserveInfo = await this.page.evaluate(() => {
                const labels = Array.from(document.querySelectorAll('label, span, em'));
                const target = labels.find(el => (el.innerText || '').trim() === '예약' && el.getBoundingClientRect().width > 0);
                if (target) {
                    const rect = target.getBoundingClientRect();
                    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                }
                return null;
            });

            if (reserveInfo) {
                await this.page.mouse.click(reserveInfo.x, reserveInfo.y);
            } else {
                const vp = this.page.viewport();
                await this.page.mouse.click(vp.width > 1000 ? 947 : vp.width - 200, 486);
            }
            await utils.randomDelay(2000, 2500); // 입력창 활성화 대기

            // ── 3. 날짜/시간 설정 (KST 기준) ─────────────────────────────
            const dateObj = new Date(options.scheduled_at);
            const kstParts = new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            }).formatToParts(dateObj);

            const getPart = (type) => kstParts.find(p => p.type === type)?.value;
            const yyyy = getPart('year');
            const mm = getPart('month');
            const dd = getPart('day');
            const hourVal = getPart('hour');
            const rawMin = parseInt(getPart('minute'));
            const minVal = String(Math.round(rawMin / 10) * 10).padStart(2, '0');
            const dateStr = `${yyyy}. ${mm}. ${dd}.`;
            this._logDetail(`[예약발행] KST 계산 시간: ${dateStr} ${hourVal}:${minVal}`);

            // ── 4. 날짜 입력 ────────────────────────────────────────────
            const frame = this._getEditorFrame();
            const dateInp = await frame.$('input[type="text"][placeholder*="20"], .item_publish input');
            if (dateInp) {
                await dateInp.click({ clickCount: 3 });
                await this.page.keyboard.press('Backspace');
                await this.page.keyboard.type(dateStr, { delay: 50 });
                await this.page.keyboard.press('Enter');
                await utils.randomDelay(500, 800);
            }

            // ── 5. 시/분 선택 ─────────────────────────────────────────
            await frame.evaluate((h, m) => {
                const hStr = String(h).padStart(2, '0');
                const mStr = String(m).padStart(2, '0');
                const selects = Array.from(document.querySelectorAll('select'));
                selects.forEach(s => {
                    const opts = Array.from(s.options).map(o => o.value);
                    if (opts.includes(hStr) && opts.length >= 24) s.value = hStr;
                    if (opts.includes(mStr) && opts.includes('00') && opts.includes('50')) s.value = mStr;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }, hourVal, minVal);
            await utils.randomDelay(1500, 2000);

            // 6. 패널 상세 설정 통합 (공개설정, 카테고리, 주제)
            const visibility = options.visibility || 'all';
            await this._ensurePublishPanelOpen();
            await this._setVisibility(visibility, options.category_id, options.topic_id, options.category_name);
            await utils.randomDelay(1000, 1500);
            await this._ensurePublishPanelOpen();
            await this._setInteractionSettings(options);
            await utils.randomDelay(1000, 1500);

            // ── 8. 최종 "예약" 버튼 클릭 ────────────────────────────
            console.log('[Module 4] [예약발행] 최종 예약 버튼 클릭 시도...');
            const success = await this._clickScheduledConfirmButton();
            if (success) {
                this._logDetail('[예약발행] ✅ 최종 발행 버튼 클릭 성공!');
            } else {
                throw new Error("최종 예약 버튼 클릭 실패");
            }

            // ── 9. 발행 완료 대기 및 URL 확인 ─────────────────────────
            await utils.randomDelay(4000, 5000);
            const finalUrl = this.page.url();
            const isSuccess = !finalUrl.includes('Redirect=Write') && !finalUrl.includes('write.blog.naver.com');
            console.log(`[Module 4] [예약발행] 최종 URL: ${finalUrl} | 성공여부: ${isSuccess}`);
            return finalUrl;

        } catch (e) {
            console.error(`[Module 4] [예약발행] 오류: ${e.message}`);
            await this.page.screenshot({ path: path.join(process.cwd(), 'logs', `scheduled_error_${Date.now()}.png`) }).catch(() => { });
            throw e;
        }
    }

    // 전용 로그 함수 추가
    _logDetail(msg) {
        const fullMsg = `[Module 4] ${msg}`;
        console.log(fullMsg);
        try {
            require('fs').appendFileSync(path.join(process.cwd(), 'logs', 'executor_detail.log'), `${new Date().toISOString()} ${fullMsg}\n`);
        } catch (e) { }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 사이드바/팝업 닫기
    // ─────────────────────────────────────────────────────────────────────
    async _closeSidebars() {
        const frame = this._getEditorFrame();
        for (let i = 0; i < 3; i++) {
            await frame.evaluate(() => {
                const closeSelectors = [
                    '.se-aside-close-button',
                    '.se-aside-library-close-button',
                    '.se-aside-header-close-button',
                    '[class*="aside_close"]',
                    '[class*="library_close"]',
                    'button[aria-label="닫기"]',
                    'button[title="닫기"]',
                    '.se-btn-close',
                ];
                closeSelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(b => {
                        if (b.getBoundingClientRect().width > 0) b.click();
                    });
                });
                const lib = document.querySelector('.se-aside-library, .se-library-view, [class*="aside_library"], [class*="Library_wrap"]');
                if (lib && lib.getBoundingClientRect().width > 0) {
                    lib.querySelectorAll('button').forEach(b => b.click());
                }
                document.querySelectorAll('.se-help-popup, .se-popup-container').forEach(ov => {
                    ov.querySelectorAll('button').forEach(b => b.click());
                });
            }).catch(() => { });
            await this.page.keyboard.press('Escape');
            await utils.randomDelay(400, 600);
        }
    }

    /**
     * 보조: 발행 패널이 현재 열려 있는지 확인합니다.
     * 최종 발행 버튼(seOnePublishBtn)이 화면에 보이면 열려 있는 것으로 확실히 간주합니다.
     */
    async _isPublishPanelOpen() {
        const frame = this._getEditorFrame();
        return await frame.evaluate(() => {
            const vpWidth = window.innerWidth;
            const panelLeft = vpWidth * 0.55; // 패널은 화면 우측 45% 영역에 존재

            // 1. 최종 발행 버튼 (data-testid — 가장 확실한 지표)
            const confirmBtn = document.querySelector('[data-testid="seOnePublishBtn"]');
            if (confirmBtn && confirmBtn.getBoundingClientRect().width > 0) return true;

            // 2. 주제 팝업이 열려 있으면 패널도 열린 상태
            const topicPopup = Array.from(document.querySelectorAll('*')).find(el => {
                const txt = (el.innerText || '').trim();
                const r = el.getBoundingClientRect();
                return txt === '주제 설정' && r.width > 0 && r.height > 0;
            });
            if (topicPopup) return true;

            // 3. 공개 설정 라디오버튼 — 패널에만 존재, 블로그 본문에는 없음
            //    패널은 화면 우측에 위치하므로 left > 55% 조건으로 본문과 구분
            const panelRadio = Array.from(document.querySelectorAll('input[type="radio"]')).find(r => {
                const rect = r.getBoundingClientRect();
                return rect.width > 0 && rect.left > panelLeft;
            });
            if (panelRadio) return true;

            // 4. 패널 컨테이너 클래스 탐색
            const panelSelectors = [
                '.se-setting-panel',
                '[class*="Setting_panel"]',
                '[class*="PublishSetting"]',
                '[class*="publish_setting"]',
                '[class*="setting_panel"]',
            ];
            for (const sel of panelSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 100) return true;
                }
            }

            return false;
        }).catch(() => false);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 우측 상단 발행 버튼 클릭
    // ─────────────────────────────────────────────────────────────────────
    async _clickTopPublishButton() {
        const isOpen = await this._isPublishPanelOpen();
        if (isOpen) {
            this._logDetail('[상단클릭] 발행 패널이 이미 열려 있는 것이 확인되었습니다. (중복 클릭 방지)');
            return;
        }

        const frame = this._getEditorFrame();
        this._logDetail('[상단클릭] 발행 패널을 열기 위해 상단 버튼을 클릭합니다.');
        
        const clicked = await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, span, em'));
            // 우측 상단 "발행" 버튼 정밀 타겟팅
            const target = buttons.find(el => {
                const text = (el.innerText || el.textContent || '').trim();
                const rect = el.getBoundingClientRect();
                return (text === '발행' || text === 'Publish') && rect.top < 100 && rect.right > (window.innerWidth - 200);
            });
            if (target) { target.click(); return true; }
            return false;
        });

        if (clicked) {
            this._logDetail('✅ 우상단 발행 버튼 DOM 클릭 성공');
            await utils.randomDelay(2000, 3000); // 패널이 열릴 때까지 충분히 대기
        } else {
            const vp = this.page.viewport();
            await this.page.mouse.click(vp.width - 50, 30);
            this._logDetail(`⚠️ DOM 미발견 -> 좌표 클릭 (${vp.width - 50}, 30)`);
            await utils.randomDelay(2000, 3000);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 발행 설정 패널 열림 대기
    //  ※ 클릭 전 DOM 상태와 비교하여 "새 패널"이 열렸는지 확인
    // ─────────────────────────────────────────────────────────────────────
    async _waitForPublishPanel() {
        // 패널이 열리면 나타나는 고유한 요소들을 기다림
        // 네이버 스마트에디터 발행패널: 공개/비공개 라디오, 카테고리 선택 UI가 새로 나타남
        return this.page.waitForFunction(() => {
            // 방법 1: input[type=radio]가 화면에 새로 나타났는지 (패널 내 공개 설정 라디오)
            const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
            const visibleRadio = radios.some(r => {
                const rect = r.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
            if (visibleRadio) return true;

            // 방법 2: 발행 패널 컨테이너 클래스 직접 감지
            const panelSelectors = [
                '.se-setting-panel',
                '[class*="Setting_panel"]',
                '[class*="PublishSetting"]',
                '[class*="publish_setting"]',
                '[class*="setting_wrap"]',
            ];
            for (const sel of panelSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 50) return true;
                }
            }
            return false;
        }, { timeout: 8000 }).then(() => true).catch(() => false);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 공개 설정 선택
    // ─────────────────────────────────────────────────────────────────────
    async _setVisibility(visibility, categoryId = null, topicName = null, categoryName = null) {
        const visLabels = { 'all': '전체공개', 'neighbor': '이웃공개', 'buddy': '서로이웃공개', 'private': '비공개' };
        const visIndices = { 'all': 0, 'neighbor': 1, 'buddy': 2, 'private': 3 };
        const targetText = visLabels[visibility] || '전체공개';
        const targetIndex = visIndices[visibility] || 0;
        
        this._logDetail(`[발행설정] 공개 설정 시도: "${targetText}" (입력값: ${visibility})`);
        const frame = this._getEditorFrame();
        
        try {
            for (let attempt = 1; attempt <= 3; attempt++) {
                const result = await frame.evaluate((targetText, targetIndex) => {
                    const allElements = Array.from(document.querySelectorAll('*'));
                    const visSection = allElements.find(el => (el.innerText || '').includes('공개 설정') && el.getBoundingClientRect().width > 0);
                    const searchArea = visSection?.closest('ul, div, .se-setting-panel') || document;
                    const foundLabel = Array.from(searchArea.querySelectorAll('label, span')).find(el => (el.innerText || '').trim() === targetText && el.getBoundingClientRect().width > 0);
                    const radios = Array.from(searchArea.querySelectorAll('input[type="radio"]'));
                    const targetRadio = radios[targetIndex] || radios.find(r => r.id.includes(targetText) || r.value.includes(targetText));

                    const finalElement = foundLabel || targetRadio;
                    if (finalElement) {
                        const rect = finalElement.getBoundingClientRect();
                        return { success: true, found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2, id: targetRadio ? targetRadio.id : (foundLabel ? foundLabel.getAttribute('for') : null) };
                    }
                    return { success: false, found: false };
                }, targetText, targetIndex);

                if (result.success && result.found) {
                    this._logDetail(`[발행설정] 공개 설정 대상 클릭: (${result.x}, ${result.y})`);
                    await this.page.mouse.click(result.x, result.y);
                    if (result.id) {
                        await frame.evaluate((tid) => {
                            const r = document.getElementById(tid);
                            if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); r.dispatchEvent(new Event('click', { bubbles: true })); }
                        }, result.id);
                    }
                    await utils.randomDelay(1000, 1200);
                    
                    const finalCheck = await frame.evaluate((tid, targetIndex) => {
                        const r = tid ? document.getElementById(tid) : document.querySelectorAll('input[type="radio"]')[targetIndex];
                        return r ? r.checked : false;
                    }, result.id, targetIndex);

                    if (finalCheck) {
                        this._logDetail(`[발행설정] ✅ 공개 설정 완료 및 검증 성공: ${targetText}`);
                        break; 
                    }
                }
                this._logDetail(`[발행설정] ⚠️ 공개 설정 검증 실패 (Retry ${attempt}/3)`);
                await utils.randomDelay(1000, 1500);
            }

            // 공개 설정 완료 직후, 사용자 요청에 따라 카테고리와 주제 설정 이어서 진행
            if (categoryId) await this._setCategory(categoryId, categoryName);
            if (topicName) await this._setTopic(topicName);

            return true;
        } catch (e) {
            this._logDetail(`[발행설정] ❌ 설정 통합 과정 오류: ${e.message}`);
            return false;
        }
    }

    async _setCategory(categoryId, categoryName) {
        if (!categoryId) return;
        this._logDetail(`[화면설정] 카테고리 설정 시작: id=${categoryId}, name=${categoryName || ''}`);

        // 페이지와 프레임 둘 다 시도 (SmartEditor ONE은 mainFrame iframe이 없는 경우가 많음)
        const frame = this._getEditorFrame();
        const contexts = [this.page, frame].filter((ctx, i, arr) => arr.indexOf(ctx) === i);

        for (const ctx of contexts) {
            const ctxName = ctx === this.page ? 'page' : 'frame';
            try {
                // Step 1: 카테고리 영역 클릭해서 드롭다운 열기
                const clickInfo = await ctx.evaluate(() => {
                    const allEls = Array.from(document.querySelectorAll('*'));
                    // 텍스트가 '카테고리'인 요소를 찾되, children 수 제한 없애서 더 넓게 찾음
                    const label = allEls.find(el => {
                        const txt = (el.innerText || el.textContent || '').trim();
                        return (txt === '카테고리' || txt === '블로그 카테고리')
                            && el.getBoundingClientRect().width > 0;
                    });
                    if (!label) return { found: false, reason: '카테고리 레이블 미발견' };

                    // label에서 부모를 타고 올라가며 클릭 가능한 트리거 찾기
                    let node = label;
                    for (let i = 0; i < 6; i++) {
                        if (!node.parentElement) break;
                        node = node.parentElement;
                        const trigger = node.querySelector(
                            'button, [role="button"], select, [class*="Category"], [class*="category"], a'
                        );
                        if (trigger && trigger !== label) {
                            const r = trigger.getBoundingClientRect();
                            if (r.width > 0) {
                                trigger.setAttribute('data-puppeteer-target', 'cat-trigger');
                                return { found: true, selector: '[data-puppeteer-target="cat-trigger"]' };
                            }
                        }
                    }
                    // fallback: label 우측 영역 대신 label 자체 클릭
                    label.setAttribute('data-puppeteer-target', 'cat-trigger-label');
                    return { found: true, selector: '[data-puppeteer-target="cat-trigger-label"]' };
                });

                this._logDetail(`[카테고리] ${ctxName} 직접 클릭 탐색: ${JSON.stringify(clickInfo)}`);
                if (!clickInfo.found) continue;

                const triggerHandle = await ctx.$(clickInfo.selector);
                if (triggerHandle) {
                    await triggerHandle.scrollIntoView();
                    await utils.randomDelay(300, 500);
                    await triggerHandle.click();
                }

                await utils.randomDelay(1500, 2000);

                // Step 2: 드롭다운 아이템에서 카테고리 ID로 매칭
                const selected = await ctx.evaluate((catId, catName) => {
                    const hardNormalize = (txt) => (txt || '').replace(/[\s\u00B7\u30FB\u2022\uFE45\u22C5\/]/g, '').toLowerCase();

                    const items = Array.from(
                        document.querySelectorAll('li, [role="option"], option, [class*="Category"], [class*="category"]')
                    ).filter(el => el.getBoundingClientRect().width > 0);

                    const byAttr = items.find(i =>
                        i.getAttribute('data-category-no') === String(catId) ||
                        i.getAttribute('data-value') === String(catId) ||
                        i.getAttribute('value') === String(catId)
                    );
                    if (byAttr) {
                        byAttr.setAttribute('data-puppeteer-target', 'cat-item');
                        return { matched: true, by: 'attr', text: byAttr.innerText, selector: '[data-puppeteer-target="cat-item"]' };
                    }

                    if (catName) {
                        const targetStr = hardNormalize(catName);
                        let byName = items.find(i => hardNormalize(i.innerText || i.textContent) === targetStr);
                        if (!byName) byName = items.find(i => hardNormalize(i.innerText || i.textContent).includes(targetStr));

                        if (byName) {
                            byName.setAttribute('data-puppeteer-target', 'cat-item');
                            return { matched: true, by: 'name', text: byName.innerText || byName.textContent, selector: '[data-puppeteer-target="cat-item"]' };
                        }
                    }

                    const log = items.map(i => ({
                        no: i.getAttribute('data-category-no'),
                        txt: (i.innerText || '').trim().slice(0, 15)
                    })).slice(0, 10);
                    return { matched: false, available: log };
                }, categoryId, categoryName || '');

                this._logDetail(`[카테고리] ${ctxName} 매칭 결과: ${JSON.stringify(selected)}`);
                if (selected.matched && selected.selector) {
                    const itemHandle = await ctx.$(selected.selector);
                    if (itemHandle) {
                        await itemHandle.scrollIntoView();
                        await utils.randomDelay(300, 500);
                        await itemHandle.click();
                    }
                    // 카테고리 선택 후 발행 패널 UI가 재렌더링될 때까지 충분히 대기
                    // (재렌더링 완료 전에 _setTopic()이 실행되면 주제 트리거를 찾지 못할 수 있음)
                    await utils.randomDelay(1500, 2000);
                    this._logDetail(`[발행설정] ✅ 카테고리 하드웨어 클릭 완료: ${selected.text}`);
                    return;
                }
            } catch (e) {
                this._logDetail(`[\uce74\ud14c\uace0\ub9ac] ${ctxName} \uc624\ub958: ${e.message}`);
            }
        }
        this._logDetail(`[\uc0ac\uc124\uc815] \u26a0\ufe0f \uce74\ud14c\uace0\ub9ac \ubaa8\ub4e0 \uc2dc\ub3c4 \uc2e4\ud328: ${categoryId}`);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 글 주제 설정
    // ─────────────────────────────────────────────────────────────────────
    async _setTopic(topicName) {
        if (!topicName || topicName === '0' || topicName === '주제 선택 안 함') return;
        this._logDetail(`[화면설정] 주제 설정 시작: "${topicName}"`);
        const frame = this._getEditorFrame();
        // 발행 패널은 메인 문서(this.page)에 열리므로 page + frame 양쪽 탐색 (_setCategory 동일 방식)
        const contexts = [this.page, frame].filter((ctx, i, arr) => arr.indexOf(ctx) === i);

        try {
            // Step 1: 주제 행(트리거) 클릭 — page → frame 순으로 탐색
            let triggerClicked = false;
            let successCtx = null;

            for (const ctx of contexts) {
                const ctxName = ctx === this.page ? 'page' : 'frame';
                const clickInfo = await ctx.evaluate(() => {
                    const allEls = Array.from(document.querySelectorAll('*'));
                    const label = allEls.find(el => {
                        const txt = (el.innerText || '').trim();
                        return (txt === '주제' || txt === '글 주제') && el.getBoundingClientRect().width > 0;
                    });
                    if (!label) return { found: false, reason: '주제 레이블 미발견' };
                    let node = label;
                    for (let i = 0; i < 6; i++) {
                        if (!node.parentElement) break;
                        node = node.parentElement;
                        const trigger = node.querySelector('button, [role="button"], a, [class*="Topic"], [class*="topic"]');
                        if (trigger && trigger !== label) {
                            const r = trigger.getBoundingClientRect();
                            if (r.width > 0) {
                                trigger.setAttribute('data-puppeteer-target', 'topic-trigger');
                                return { found: true, selector: '[data-puppeteer-target="topic-trigger"]' };
                            }
                        }
                    }
                    label.setAttribute('data-puppeteer-target', 'topic-trigger-label');
                    return { found: true, selector: '[data-puppeteer-target="topic-trigger-label"]' };
                });

                this._logDetail(`[주제] ${ctxName} 클릭 탐색: ${JSON.stringify(clickInfo)}`);

                if (clickInfo.found && clickInfo.selector) {
                    const triggerHandle = await ctx.$(clickInfo.selector);
                    if (triggerHandle) {
                        await triggerHandle.scrollIntoView().catch(() => {});
                        await utils.randomDelay(300, 500);
                        await triggerHandle.click();
                        triggerClicked = true;
                        successCtx = ctx;
                        this._logDetail(`[주제] ${ctxName}에서 트리거 클릭 성공`);
                        break;
                    }
                }
            }

            if (!triggerClicked) {
                this._logDetail(`[화면설정] ⚠️ 주제 트리거를 page/frame 어디서도 찾지 못함: ${topicName}`);
                return;
            }
            await utils.randomDelay(3000, 3500);

            // Step 2: 팝업 내에서 주제 항목 선택 — 트리거 성공한 ctx 우선, 나머지 폴백
            const orderedCtx = successCtx
                ? [successCtx, ...contexts.filter(c => c !== successCtx)]
                : contexts;

            for (const ctx of orderedCtx) {
                const ctxName = ctx === this.page ? 'page' : 'frame';
                const setSuccess = await ctx.evaluate((name) => {
                    const normalize = (txt) => txt.replace(/[\u00B7\u30FB\u2022\uFE45\u22C5]/g, '\u00B7').replace(/\s+/g, ' ').trim();
                    const target = normalize(String(name));

                    // ── 1. 팝업 컨테이너를 "주제 설정" 타이틀 텍스트로 찾기 ──────────────
                    // 클래스명 기반 탐색은 Naver CSS 모듈 해시로 인해 불일치하는 경우가 많음.
                    // 팝업 타이틀("주제 설정")을 anchor로 삼아 실제 컨테이너를 역추적.
                    let searchRoot = null;
                    const allEls = Array.from(document.querySelectorAll('*'));
                    const titleEl = allEls.find(el => {
                        const txt = (el.innerText || '').trim();
                        const r = el.getBoundingClientRect();
                        return txt === '주제 설정' && r.width > 0 && r.height > 0;
                    });
                    if (titleEl) {
                        // 타이틀에서 위로 올라가며 충분히 큰 컨테이너(팝업 본체) 찾기
                        let node = titleEl;
                        for (let i = 0; i < 12; i++) {
                            if (!node.parentElement) break;
                            node = node.parentElement;
                            const r = node.getBoundingClientRect();
                            if (r.width > 300 && r.height > 200) { searchRoot = node; break; }
                        }
                    }
                    // 타이틀 기반 실패 시 클래스명 폴백
                    if (!searchRoot) {
                        const POPUP_SELS = [
                            '[class*="Popup"]','[class*="popup"]','[class*="Layer"]','[class*="Modal"]',
                            '.se-popup-container','[class*="TopicSelect"]','[class*="topic_select"]'
                        ];
                        for (const s of POPUP_SELS) {
                            const el = document.querySelector(s);
                            if (el && el.getBoundingClientRect().width > 0) { searchRoot = el; break; }
                        }
                    }

                    // ── 2. 팝업 내에서만 주제 항목 탐색 ──────────────────────────────────
                    // searchRoot 없이 document 전체 탐색 시 블로그 본문의 동일 텍스트와 혼동됨
                    if (!searchRoot) return { success: false, popup: false, reason: '팝업 컨테이너 미발견' };
                    const root = searchRoot;

                    // ── 2. 팝업 항목 탐색: LABEL 우선 (LI > INPUT[radio] + LABEL 구조) ──
                    // 네이버 주제 팝업은 라디오버튼+레이블 구조임.
                    // LI 클릭은 라디오를 체크하지 않으므로 LABEL을 직접 찾아야 함.
                    const labelEls = Array.from(root.querySelectorAll('label'));
                    const exactLabels = labelEls.filter(el => {
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0 && normalize(el.innerText || el.textContent || '') === target;
                    });

                    // LABEL이 없으면 다른 요소 폴백 (li, button, a, span)
                    const allVis = Array.from(root.querySelectorAll('li, [role="option"], button, a, span, em'));
                    const exactOther = allVis.filter(el => {
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0 && normalize(el.innerText || el.textContent || '') === target;
                    });

                    const candidates = exactLabels.length > 0 ? exactLabels : exactOther;
                    if (candidates.length === 0) return { success: false, popup: true, reason: `항목 미발견: "${target}"` };

                    // 가장 innermost(텍스트 짧은) 요소 선택 — LABEL 우선이므로 exactLabels에서 이미 정확
                    const best = candidates.reduce((a, b) => (a.innerText || '').length <= (b.innerText || '').length ? a : b);

                    // 연결된 라디오 INPUT 탐색 (좌표 반환용 — 직접 체크 조작은 하지 않음)
                    // React controlled input에 .checked = true를 직접 설정하면 verifyResult에서
                    // false positive가 발생해 hardware click 실패를 감지하지 못하므로 제거.
                    let radioInput = null;
                    if (best.tagName === 'LABEL' && best.htmlFor) {
                        radioInput = document.getElementById(best.htmlFor);
                    }
                    if (!radioInput && best.tagName === 'LABEL') {
                        radioInput = best.querySelector('input[type="radio"]') ||
                                     best.closest('li')?.querySelector('input[type="radio"]');
                    }

                    // ── 3. 팝업 내 확인 버튼 탐색 — 좌표 미리 기록 ─────────────────────
                    // 우선순위: ① data-click-area 속성 → ② class*="ok_btn" → ③ 텍스트 기반
                    // (이미지 분석 결과: 확인버튼은 data-click-area="tpb*i.subjectok", class="ok_btn__xxx" 보유)
                    const _findConfirmBtn = (scope) => {
                        // 1순위: data-click-area 속성 (가장 신뢰할 수 있는 식별자)
                        let btn = scope.querySelector('[data-click-area*="subjectok"]');
                        if (btn && btn.getBoundingClientRect().width > 0) return btn;
                        // 2순위: class에 ok_btn 포함 (해시 suffix 무시)
                        btn = Array.from(scope.querySelectorAll('button[class*="ok_btn"]')).find(b => b.getBoundingClientRect().width > 0);
                        if (btn) return btn;
                        // 3순위: 텍스트 기반 폴백 (취소/발행 버튼 명시적 제외)
                        btn = Array.from(scope.querySelectorAll('button, a')).find(b => {
                            const t = (b.innerText || b.textContent || '').trim();
                            const isExcluded = t.includes('발행') || t.includes('예약') || t.includes('저장') || t.includes('취소');
                            return (t === '확인' || t === '적용') && !isExcluded && b.getBoundingClientRect().width > 0;
                        });
                        return btn || null;
                    };
                    const confirmBtn = _findConfirmBtn(root);

                    // ── 4. LABEL 하드웨어 클릭을 위한 좌표 반환 ──────────────────────────
                    const bRect = best.getBoundingClientRect();
                    const radioChecked = radioInput ? radioInput.checked : false;
                    const confirmRect = confirmBtn ? confirmBtn.getBoundingClientRect() : null;
                    return {
                        success: true,
                        popup: true,
                        itemText: (best.innerText || best.textContent || '').trim(),
                        itemTag: best.tagName,
                        itemX: bRect.left + bRect.width / 2,
                        itemY: bRect.top + bRect.height / 2,
                        hasConfirm: !!confirmBtn,
                        confirmX: confirmRect ? confirmRect.left + confirmRect.width / 2 : null,
                        confirmY: confirmRect ? confirmRect.top + confirmRect.height / 2 : null,
                        radioChecked,
                    };
                }, topicName);

                this._logDetail(`[주제] ${ctxName} 매칭 결과: ${JSON.stringify(setSuccess)}`);

                if (setSuccess.success) {
                    // 전략: LABEL 좌표로 먼저 하드웨어 클릭 시도
                    // (radioInput.checked 설정은 React에서 무효이므로 실제 클릭 좌표에 의존)
                    if (setSuccess.itemX && setSuccess.itemY) {
                        await utils.randomDelay(200, 300);
                        await this.page.mouse.click(setSuccess.itemX, setSuccess.itemY);
                        this._logDetail(`[주제] 좌표 클릭 완료: (${Math.round(setSuccess.itemX)}, ${Math.round(setSuccess.itemY)}) "${setSuccess.itemText}"`);
                    }

                    // 클릭 후 실제 선택 여부 확인 (라디오가 체크됐는지 검증)
                    await utils.randomDelay(400, 600);
                    const verifyResult = await ctx.evaluate((name) => {
                        const normalize = (txt) => txt.replace(/[\u00B7\u30FB\u2022\uFE45\u22C5]/g, '\u00B7').replace(/\s+/g, ' ').trim();
                        const target = normalize(String(name));
                        // 선택된 라디오 input 확인
                        const allInputs = Array.from(document.querySelectorAll('input[type="radio"]:checked'));
                        const checkedInput = allInputs.find(inp => {
                            // 해당 input의 label 텍스트 확인
                            const label = document.querySelector(`label[for="${inp.id}"]`) ||
                                          inp.closest('li')?.querySelector('label');
                            const labelTxt = normalize(label?.innerText || label?.textContent || '');
                            return labelTxt === target;
                        });
                        if (checkedInput) return { selected: true };

                        // 선택이 안 됐으면 INPUT[radio] 직접 좌표 반환 (재클릭용)
                        const allLabels = Array.from(document.querySelectorAll('label'));
                        const targetLabel = allLabels.find(l => normalize(l.innerText || l.textContent || '') === target && l.getBoundingClientRect().width > 0);
                        if (!targetLabel) return { selected: false, noRetry: true };

                        // 해당 라벨의 input 찾기
                        const inputEl = targetLabel.htmlFor
                            ? document.getElementById(targetLabel.htmlFor)
                            : targetLabel.closest('li')?.querySelector('input[type="radio"]');

                        if (inputEl) {
                            const r = inputEl.getBoundingClientRect();
                            return { selected: false, retryX: r.left + r.width / 2, retryY: r.top + r.height / 2, type: 'radio' };
                        }
                        // input 없으면 label 다시 클릭
                        const lr = targetLabel.getBoundingClientRect();
                        return { selected: false, retryX: lr.left + lr.width / 2, retryY: lr.top + lr.height / 2, type: 'label' };
                    }, setSuccess.itemText);

                    this._logDetail(`[주제] 선택 확인: ${JSON.stringify(verifyResult)}`);

                    if (!verifyResult.selected && !verifyResult.noRetry && verifyResult.retryX) {
                        // INPUT[radio] 또는 LABEL을 재클릭
                        this._logDetail(`[주제] 재클릭 시도: (${Math.round(verifyResult.retryX)}, ${Math.round(verifyResult.retryY)}) type=${verifyResult.type}`);
                        await this.page.mouse.click(verifyResult.retryX, verifyResult.retryY);
                        await utils.randomDelay(500, 700);
                    }

                    // ── 확인 버튼 클릭 ──────────────────────────────────────────────────
                    // 핵심 문제: iframe 내부 좌표로 page.mouse.click() 호출 시
                    // iframe 오프셋만큼 빗나가서 실제 버튼을 클릭하지 못함.
                    // 해결: evaluate() 내부에서 btn.click()을 직접 호출 (좌표 불필요).
                    const confirmCtxs = successCtx
                        ? [successCtx, ...contexts.filter(c => c !== successCtx)]
                        : contexts;

                    // evaluate 내부에서 버튼을 탐색하고 바로 .click() 호출
                    const _clickConfirmBtn = async (cCtx) => cCtx.evaluate(() => {
                        const find = () => {
                            let b = document.querySelector('[data-click-area*="subjectok"]');
                            if (b && b.getBoundingClientRect().width > 0) return { el: b, by: 'data-attr' };
                            b = Array.from(document.querySelectorAll('button[class*="ok_btn"], a[class*="ok_btn"]'))
                                .find(x => x.getBoundingClientRect().width > 0);
                            if (b) return { el: b, by: 'class' };
                            b = Array.from(document.querySelectorAll('button, a')).find(x => {
                                const t = (x.innerText || x.textContent || '').trim();
                                return t === '확인' && x.getBoundingClientRect().width > 0;
                            });
                            if (b) return { el: b, by: 'text' };
                            return null;
                        };
                        const found = find();
                        if (!found) return { clicked: false };
                        found.el.click();
                        return { clicked: true, by: found.by };
                    }).catch(() => ({ clicked: false }));

                    // 팝업이 아직 열려있는지 확인
                    const _isPopupOpen = async () => {
                        for (const cCtx of confirmCtxs) {
                            const open = await cCtx.evaluate(() => {
                                const b = document.querySelector('[data-click-area*="subjectok"]') ||
                                    Array.from(document.querySelectorAll('button[class*="ok_btn"], a[class*="ok_btn"]'))
                                        .find(x => x.getBoundingClientRect().width > 0);
                                return !!(b && b.getBoundingClientRect().width > 0);
                            }).catch(() => false);
                            if (open) return true;
                        }
                        return false;
                    };

                    let confirmClicked = false;
                    for (let retryConfirm = 1; retryConfirm <= 3; retryConfirm++) {
                        await utils.randomDelay(700, 900);

                        // 1차: evaluate 내부에서 btn.click() 직접 호출
                        let clickResult = { clicked: false };
                        for (const cCtx of confirmCtxs) {
                            clickResult = await _clickConfirmBtn(cCtx);
                            if (clickResult.clicked) {
                                this._logDetail(`[주제] 확인버튼 btn.click() 호출 (${retryConfirm}/3) by=${clickResult.by}`);
                                break;
                            }
                        }

                        if (!clickResult.clicked) {
                            this._logDetail(`[주제] 확인버튼 미발견 (${retryConfirm}) — 팝업 이미 닫혔거나 버튼 없음`);
                            confirmClicked = true;
                            break;
                        }

                        await utils.randomDelay(800, 1000);
                        const stillOpen = await _isPopupOpen();
                        if (!stillOpen) {
                            this._logDetail(`[주제] ✅ 확인버튼 클릭 성공 — 팝업 닫힘 확인`);
                            confirmClicked = true;
                            break;
                        }

                        // 2차 폴백: 하드웨어 마우스 클릭 (프레임 오프셋 보정 포함)
                        this._logDetail(`[주제] btn.click() 후 팝업 열림 — 하드웨어 클릭 폴백 시도`);
                        let hwClicked = false;
                        for (const cCtx of confirmCtxs) {
                            const frameOffset = cCtx !== this.page
                                ? await this.page.evaluate(() => {
                                    const fr = Array.from(document.querySelectorAll('iframe'))
                                        .find(f => f.name === 'mainFrame' || (f.src || '').includes('PostWriteForm'));
                                    if (fr) { const r = fr.getBoundingClientRect(); return { top: r.top, left: r.left }; }
                                    return { top: 0, left: 0 };
                                }).catch(() => ({ top: 0, left: 0 }))
                                : { top: 0, left: 0 };

                            const coords = await cCtx.evaluate(() => {
                                const b = document.querySelector('[data-click-area*="subjectok"]') ||
                                    Array.from(document.querySelectorAll('button[class*="ok_btn"], a[class*="ok_btn"]'))
                                        .find(x => x.getBoundingClientRect().width > 0);
                                if (!b) return null;
                                const r = b.getBoundingClientRect();
                                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                            }).catch(() => null);

                            if (coords) {
                                const pageX = coords.x + frameOffset.left;
                                const pageY = coords.y + frameOffset.top;
                                this._logDetail(`[주제] 하드웨어 클릭: (${Math.round(pageX)}, ${Math.round(pageY)}) offset=(${Math.round(frameOffset.left)}, ${Math.round(frameOffset.top)})`);
                                await this.page.mouse.click(pageX, pageY);
                                hwClicked = true;
                                break;
                            }
                        }
                        if (!hwClicked) { this._logDetail(`[주제] 하드웨어 클릭 좌표 확보 실패`); break; }
                        await utils.randomDelay(800, 1000);
                        if (!await _isPopupOpen()) {
                            this._logDetail(`[주제] ✅ 하드웨어 클릭 성공 — 팝업 닫힘`);
                            confirmClicked = true;
                            break;
                        }
                        this._logDetail(`[주제] 재시도 (${retryConfirm}/3)`);
                    }

                    if (!confirmClicked) {
                        this._logDetail(`[주제] ⚠️ 3회 모두 실패 — Escape로 팝업 닫기 시도`);
                        await this.page.keyboard.press('Escape');
                        await utils.randomDelay(500, 700);
                    }

                    await utils.randomDelay(1500, 2000);
                    this._logDetail(`[화면설정] ✅ 주제 설정 완료: ${topicName} (${ctxName})`);
                    return;
                }
            }

            this._logDetail(`[화면설정] ⚠️ 주제 항목을 page/frame 어디서도 매칭하지 못함: ${topicName}`);
        } catch (e) { this._logDetail(`[주제] 오류: ${e.message}`); }
    }
    // ─────────────────────────────────────────────────────────────────────
    //  헬퍼: 상호작용 설정 (댓글, 공감, 검색 등)
    // ─────────────────────────────────────────────────────────────────────
    async _setInteractionSettings(options) {
        this._logDetail('[발행설정] 체크박스 설정 동기화...');
        const frame = this._getEditorFrame();
        try {
            // 0. 상세 설정이 접혀있는지 확인하고 펼치기 (사용자 스크린샷에서 접혀있음)
            await frame.evaluate(() => {
                const header = Array.from(document.querySelectorAll('div, span, button')).find(el => (el.innerText || '').includes('발행 설정') && el.getBoundingClientRect().width > 0);
                if (header) {
                    const container = header.closest('div[class*="Setting_item"], .se-publish-setting-item');
                    // 화살표 버튼이 있는 버튼을 찾아 클릭 (접혀있을 때만)
                    const expandBtn = container?.querySelector('button[aria-expanded="false"], button[class*="toggle"]');
                    if (expandBtn) expandBtn.click();
                }
            });
            await utils.randomDelay(800, 1200);

            const result = await frame.evaluate((opts) => {
                const logs = [];
                const checkItems = [
                    { key: 'allow_comments', label: '댓글허용' },
                    { key: 'allow_likes', label: '공감허용' },
                    { key: 'allow_search', label: '검색허용' },
                    { key: 'allow_share', label: '블로그/카페' },
                    { key: 'allow_external', label: '외부 공유 허용' }
                ];
                
                checkItems.forEach(item => {
                    const wantChecked = opts[item.key] !== false;
                    const labels = Array.from(document.querySelectorAll('label, span'));
                    const targetLabel = labels.find(el => (el.innerText || '').replace(/\s/g, '').includes(item.label) && el.getBoundingClientRect().width > 0);
                    
                    if (targetLabel) {
                        const checkbox = targetLabel.parentElement?.querySelector('input[type="checkbox"]') || 
                                         document.getElementById(targetLabel.getAttribute('for')) ||
                                         targetLabel.closest('li, div')?.querySelector('input[type="checkbox"]');
                        
                        if (checkbox && checkbox.checked !== wantChecked) {
                            logs.push(`${item.label} 클릭: ${checkbox.checked} -> ${wantChecked}`);
                            targetLabel.click();
                        }
                    } else {
                        logs.push(`${item.label} 레이블을 찾을 수 없음`);
                    }
                });
                return logs;
            }, options);
            
            if (result.length > 0) this._logDetail(`[발행설정] 체크박스 변경 상세: ${JSON.stringify(result)}`);
            this._logDetail('[발행설정] ✅ 체크박스 동기화 완료');
        } catch (e) {
            this._logDetail(`[발행설정] ❌ 체크박스 설정 오류: ${e.message}`);
        }
    }

    /**
     * 헬퍼: [즉시 발행] 전용 최종 확인 버튼 클릭
     */
    async _clickImmediateConfirmButton() {
        const frame = this._getEditorFrame();
        this._logDetail('[즉시발행] 속성 기반 최종 확인 버튼 탐색 중...');

        const buttonInfo = await frame.evaluate(() => {
            // 1. 제공된 data-testid 속성으로 가장 먼저 찾기
            const testIdBtn = document.querySelector('[data-testid="seOnePublishBtn"]');
            if (testIdBtn && testIdBtn.getBoundingClientRect().width > 0) {
                const rect = testIdBtn.getBoundingClientRect();
                return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: 'data-testid', type: 'id' };
            }

            // 2. 클래스명으로 찾기
            const classBtn = document.querySelector('.confirm_btn__WEaBq');
            if (classBtn && classBtn.getBoundingClientRect().width > 0) {
                const rect = classBtn.getBoundingClientRect();
                return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: '.confirm_btn__WEaBq', type: 'class' };
            }

            // 3. 기존 텍스트/아이콘 로직 (폴백)
            const buttons = Array.from(document.querySelectorAll('button, a, span, em'));
            const candidates = buttons.filter(b => {
                const rect = b.getBoundingClientRect();
                return rect.top > 100 && rect.left > (window.innerWidth / 2) && rect.width > 0;
            });

            for (const b of candidates) {
                const text = (b.innerText || b.textContent || '').trim().replace(/\s/g, '');
                if (text === '발행' || text.includes('발행')) {
                    const rect = b.getBoundingClientRect();
                    return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: text, type: 'dom' };
                }
            }
            return { found: false };
        });

        if (buttonInfo.found) {
            this._logDetail(`[즉시발행] 최종 버튼 발견(${buttonInfo.type}): "${buttonInfo.text}", 클릭 시도...`);
            await this.page.mouse.click(buttonInfo.x, buttonInfo.y);
            return true;
        }

        this._logDetail('[즉시발행] ⚠️ 모든 탐색 실패, 고정 좌표 폴백 클릭');
        const vp = this.page.viewport();
        await this.page.mouse.click(vp.width - 80, vp.height - 350);
        return true;
    }

    /**
     * 헬퍼: [예약 발행] 전용 최종 확인 버튼 클릭
     */
    async _clickScheduledConfirmButton() {
        const frame = this._getEditorFrame();
        this._logDetail('[예약발행] 속성 기반 최종 확인 버튼 탐색 중...');

        const buttonInfo = await frame.evaluate(() => {
            // 1. 제공된 data-testid 속성으로 가장 먼저 찾기
            const testIdBtn = document.querySelector('[data-testid="seOnePublishBtn"]');
            if (testIdBtn && testIdBtn.getBoundingClientRect().width > 0) {
                const rect = testIdBtn.getBoundingClientRect();
                return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: 'data-testid', type: 'id' };
            }

            // 2. 예약 텍스트 포함 버튼 찾기 (예약 모드에서는 텍스트가 다를 수 있음)
            const buttons = Array.from(document.querySelectorAll('button, a, span, em'));
            const candidates = buttons.filter(b => {
                const rect = b.getBoundingClientRect();
                return rect.top > 200 && rect.left > (window.innerWidth / 2) && rect.width > 0;
            });

            for (const b of candidates) {
                const text = (b.innerText || b.textContent || '').trim().replace(/\s/g, '');
                if (text === '예약' || text === '발행' || text.includes('예약') || text.includes('발행')) {
                    const rect = b.getBoundingClientRect();
                    return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: text, type: 'dom' };
                }
            }
            return { found: false };
        });

        if (buttonInfo.found) {
            this._logDetail(`[예약발행] 최종 버튼 발견: "${buttonInfo.text}", 클릭 시도...`);
            await this.page.mouse.click(buttonInfo.x, buttonInfo.y);
            return true;
        }

        this._logDetail('[예약발행] ⚠️ 탐색 실패, 예약용 고정 좌표 폴백 클릭');
        const vp = this.page.viewport();
        await this.page.mouse.click(vp.width - 80, vp.height - 190);
        return true;
    }

    async _clickFinalPublishButton() {
        // 기존 공용 메소드는 하위 호환성을 위해 남겨두거나 삭제 가능
        // 현재는 새로운 메소드들로 대체되었으므로 사용되지 않음
        return false;
    }

    /**
     * 네이버 스마트에디터 동영상 업로드
     * 실제 flow:
     *   ① 상단 툴바 "동영상" 버튼 클릭 → 패널 팝업 열림
     *   ② 패널 내부 "동영상 추가" 버튼 클릭 → 파일 선택 다이얼로그 열림
     *   ③ 파일 선택 → 업로드 완료 대기
     */
    async _uploadVideo(frame, videoPath, pressEnter, videoTitle = '') {
        console.log(`[Module 4] Uploading video: ${videoPath}`);
        for (let retry = 0; retry < 3; retry++) {
            try {
                if (!frame || frame.isDetached()) {
                    console.log("[Module 4] Frame detached, refreshing for video upload...");
                    frame = await utils.getSeFrame(this.page);
                    if (!frame) throw new Error("Could not restore editor frame");
                }

                // ── STEP 1: 상단 툴바 "동영상" 버튼 클릭 ──────────────────
                // 툴바는 frame 안에 있음 — CSS 셀렉터 우선, 텍스트 탐색 폴백
                let videoToolbarBtn = await frame.waitForSelector(
                    'button.se-video-toolbar-button, .se-toolbar-item-video button',
                    { visible: true, timeout: 8000 }
                ).catch(() => null);

                if (!videoToolbarBtn) {
                    // 텍스트로 탐색 (폴백)
                    videoToolbarBtn = await frame.evaluateHandle(() => {
                        const btns = Array.from(document.querySelectorAll('.se-toolbar-item button, .se-toolbar button'));
                        return btns.find(b => {
                            const label = (b.innerText || b.title || b.getAttribute('aria-label') || '').trim();
                            return label === '동영상' || label.includes('동영상');
                        }) || null;
                    }).then(h => h.asElement()).catch(() => null);
                }

                if (!videoToolbarBtn) throw new Error('상단 툴바 "동영상" 버튼을 찾을 수 없습니다');

                await videoToolbarBtn.click().catch(() => frame.evaluate(el => el.click(), videoToolbarBtn));
                console.log('[Module 4] 동영상 툴바 버튼 클릭 완료 — 패널 열림 대기...');
                await utils.randomDelay(1500, 2500);

                // ── STEP 2: 패널 내 "동영상 추가" 버튼 클릭 → fileChooser 열림 ──
                // 실제 버튼: <button class="nvu_btn_append nvu_local" data-logcode="lmvup.attmv">
                // 팝업은 frame / page 양쪽에 열릴 수 있으므로 모든 컨텍스트 탐색
                const contexts = [this.page, frame].filter((c, i, a) => a.indexOf(c) === i);

                // 1순위: 정확한 CSS 셀렉터 (실제 버튼 클래스 / data 속성)
                const EXACT_SELS = [
                    'button.nvu_btn_append.nvu_local',
                    'button[data-logcode="lmvup.attmv"]',
                    'button.nvu_btn_append',
                ];

                let addVideoBtn = null;
                for (const ctx of contexts) {
                    for (const sel of EXACT_SELS) {
                        addVideoBtn = await ctx.$(sel).catch(() => null);
                        if (addVideoBtn) {
                            console.log(`[Module 4] "동영상 추가" 버튼 발견 (${sel})`);
                            break;
                        }
                    }
                    if (addVideoBtn) break;
                }

                // 2순위: 텍스트 "동영상 추가" 포함 버튼 탐색
                if (!addVideoBtn) {
                    for (const ctx of contexts) {
                        addVideoBtn = await ctx.evaluateHandle(() => {
                            const btns = Array.from(document.querySelectorAll('button, a'));
                            return btns.find(b => {
                                const t = (b.innerText || b.textContent || '').trim();
                                const r = b.getBoundingClientRect();
                                return t.includes('동영상 추가') && r.width > 0 && r.height > 0;
                            }) || null;
                        }).then(h => h.asElement ? h.asElement() : null).catch(() => null);
                        if (addVideoBtn) {
                            console.log('[Module 4] "동영상 추가" 버튼 발견 (텍스트 탐색)');
                            break;
                        }
                    }
                }

                if (!addVideoBtn) throw new Error('패널 내 "동영상 추가" 버튼을 찾을 수 없습니다');

                // "동영상 추가" 클릭 시 fileChooser가 열림
                const [fileChooser] = await Promise.all([
                    this.page.waitForFileChooser({ timeout: 15000 }),
                    addVideoBtn.click().catch(() => {})
                ]);
                await fileChooser.accept([videoPath]);
                console.log(`[Module 4] 동영상 파일 선택 완료: ${videoPath}`);

                // ── STEP 3: 업로드 진행 대기 ─────────────────────────────
                // 동영상은 이미지보다 업로드 시간이 오래 걸림 (초기 대기)
                await utils.randomDelay(5000, 8000);

                // 프로그레스바/로딩 인디케이터가 사라질 때까지 대기 (최대 3분)
                try {
                    await frame.waitForSelector(
                        '.se-video-loading, .se-media-loading, .se-placeholder-video-loading',
                        { hidden: true, timeout: 180000 }
                    ).catch(() => {});
                    // page 레벨에서도 동일하게 시도
                    await this.page.waitForSelector(
                        '[class*="progress"], [class*="loading"], [class*="uploading"]',
                        { hidden: true, timeout: 30000 }
                    ).catch(() => {});
                } catch (e) {
                    console.log("[Module 4] Video loading indicator timeout (ignoring)");
                }
                await utils.randomDelay(2000, 3000);

                // ── STEP 4: 제목 입력 → 완료 버튼 클릭 ─────────────────
                // 파일 선택/업로드 후 Naver는 동영상 제목 입력창과 완료 버튼을 표시함.
                // 제목을 입력해야만 완료 버튼이 활성화됨.
                const allCtx = [this.page, frame].filter((c, i, a) => a.indexOf(c) === i);

                const findElInContexts = async (evalFn) => {
                    for (const ctx of allCtx) {
                        try {
                            const result = await ctx.evaluateHandle(evalFn);
                            const el = result.asElement ? result.asElement() : null;
                            if (el) return el;
                        } catch (e) {}
                    }
                    return null;
                };

                // ── 4-1. 제목 입력창 탐색 및 입력 ────────────────────────
                const titleInput = await findElInContexts(() => {
                    // input 또는 textarea 중 제목 관련 placeholder/class를 가진 것
                    const candidates = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'));
                    return candidates.find(el => {
                        const ph = (el.placeholder || '').toLowerCase();
                        const cls = (el.className || '').toLowerCase();
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0 &&
                            (ph.includes('제목') || ph.includes('title') || cls.includes('title') || cls.includes('subject'));
                    }) || candidates.find(el => {
                        // placeholder/class 없어도 visible한 첫 번째 input
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0;
                    }) || null;
                });

                if (titleInput && videoTitle) {
                    console.log(`[Module 4] 동영상 제목 입력창 발견 → "${videoTitle}" 입력`);
                    await titleInput.click();
                    await utils.randomDelay(300, 500);
                    // 기존 값 초기화 후 입력
                    await this.page.keyboard.down('Control');
                    await this.page.keyboard.press('a');
                    await this.page.keyboard.up('Control');
                    await this.page.keyboard.press('Backspace');
                    await utils.randomDelay(200, 300);
                    await this.page.keyboard.type(videoTitle, { delay: 40 });
                    await utils.randomDelay(500, 800);
                    console.log('[Module 4] 동영상 제목 입력 완료');
                } else if (!titleInput) {
                    console.log('[Module 4] 제목 입력창 미발견 (스킵)');
                }

                // ── 4-2. 완료 버튼 탐색 및 클릭 ──────────────────────────
                const confirmBtn = await findElInContexts(() => {
                    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                    return btns.find(b => {
                        const t = (b.innerText || b.textContent || '').trim();
                        const r = b.getBoundingClientRect();
                        return (t === '완료' || t === '확인' || t === '등록') && r.width > 0 && r.height > 0;
                    }) || null;
                });

                if (confirmBtn) {
                    console.log('[Module 4] 동영상 완료 버튼 발견 → 클릭');
                    await confirmBtn.scrollIntoView().catch(() => {});
                    await utils.randomDelay(500, 800);
                    await confirmBtn.click();
                    await utils.randomDelay(3000, 5000);
                    console.log('[Module 4] 동영상 완료 버튼 클릭 완료');
                } else {
                    console.log('[Module 4] 완료 버튼 미발견 → Enter 키 시도');
                    await this.page.keyboard.press('Enter');
                    await utils.randomDelay(2000, 3000);
                }

                await this.page.keyboard.press('ArrowDown');
                await pressEnter(1);
                console.log(`[Module 4] 동영상 업로드 완료: ${videoPath}`);
                return true;

            } catch (e) {
                console.warn(`[Module 4] Video upload retry ${retry + 1} failed: ${e.message}`);
                const debugPath = path.join(process.cwd(), 'logs', `video_upload_error_${retry + 1}_${Date.now()}.png`);
                await this.page.screenshot({ path: debugPath }).catch(() => {});
                // 패널이 열려 있다면 ESC로 닫기
                await this.page.keyboard.press('Escape').catch(() => {});
                await utils.randomDelay(3000, 5000);
                frame = await utils.getSeFrame(this.page).catch(() => frame);
            }
        }
        console.error(`[Module 4] 동영상 업로드 3회 모두 실패: ${videoPath}`);
        return false;
    }

    async _uploadImageWithRetry(frame, imgPath, pressEnter) {
        return this._uploadImageWithRetryAndLink(frame, imgPath, null, pressEnter);
    }

    async _uploadImageWithRetryAndLink(frame, imgPath, link = null, pressEnter) {
        console.log(`[Module 4] Uploading image: ${imgPath}${link ? ' with link: ' + link : ''}`);
        for (let retry = 0; retry < 3; retry++) {
            try {
                if (!frame || frame.isDetached()) {
                    console.log("[Module 4] Frame detached or null, refreshing...");
                    frame = await utils.getSeFrame(this.page);
                    if (!frame) throw new Error("Could not restore editor frame during retry");
                }

                const photoBtn = await frame.waitForSelector('button.se-image-toolbar-button, .se-toolbar-item-image button', { visible: true, timeout: 10000 });

                // 사진 첨부 팝업을 띄우기 위한 안정적인 클릭 시퀀스 사용
                const [fileChooser] = await Promise.all([
                    this.page.waitForFileChooser({ timeout: 30000 }), // 타임아웃 제한시간 넉넉하게 증가
                    photoBtn.click().catch(() => frame.evaluate(el => el.click(), photoBtn))
                ]);

                await fileChooser.accept([imgPath]);
                await utils.randomDelay(5000, 8000);

                // 이미지 업로드 진행바가 끝날 때까지 대기
                try {
                    await frame.waitForSelector('.se-image-loading', { hidden: true, timeout: 60000 });
                } catch (e) {
                    console.log("[Module 4] Image loading indicator timeout (ignoring)");
                }

                await utils.randomDelay(2000, 3000);
                await this.page.keyboard.press('Escape');
                await this.page.keyboard.press('ArrowUp');
                await utils.randomDelay(1000, 1500);

                if (frame.isDetached()) frame = await utils.getSeFrame(this.page);

                // 링크는 정렬 클릭 전에 적용 — 정렬 버튼 클릭 시 이미지 선택이 해제되어 툴바가 사라짐
                if (link && frame) {
                    await this._applyLinkToSelectedImage(frame, link);
                }

                // 링크 적용 후 정렬
                const alignBtn = await frame?.$('.se-align-center-toolbar-button, button[class*="align_center"]');
                if (alignBtn) await alignBtn.click();
                await utils.randomDelay(1000, 1500);

                await this.page.keyboard.press('ArrowDown');
                await pressEnter(1);
                return true;
            } catch (e) {
                console.warn(`[Module 4] Image upload retry ${retry + 1} failed: ${e.message}`);

                // 문제가 생겼을 때 디버깅용 스크린샷 캡처
                const debugPath = path.join(process.cwd(), 'logs', `upload_error_retry_${retry + 1}_${Date.now()}.png`);
                await this.page.screenshot({ path: debugPath }).catch(() => { });

                await utils.randomDelay(3000, 5000);
                // 프레임 참조 변수 다시 갱신
                frame = await utils.getSeFrame(this.page);
            }
        }
        return false;
    }

    async _applyLinkToSelectedImage(frame, link) {
        console.log(`[Module 4] Applying link to image: ${link}`);
        try {
            // 링크 버튼 — main page → frame 순으로 탐색
            const linkBtn = await this.page.waitForSelector('button[data-name="image-link"], button.se-link-toolbar-button', { visible: true, timeout: 5000 }).catch(() => null)
                         || await frame.waitForSelector('button[data-name="image-link"], button.se-link-toolbar-button', { visible: true, timeout: 3000 }).catch(() => null);
            console.log(`[Module 4] Link button found: ${!!linkBtn}`);

            if (!linkBtn) {
                console.log('[Module 4] Link button not found — skipping link application');
                return;
            }
            await linkBtn.click();
            console.log('[Module 4] Link button clicked');
            await utils.randomDelay(1000, 1500);

            // 입력란 탐색 — main page → frame
            let linkInput = await this.page.waitForSelector('input.se-custom-layer-link-input', { visible: true, timeout: 3000 }).catch(() => null);
            let inputCtx = 'page';
            if (!linkInput) {
                linkInput = await frame.waitForSelector('input.se-custom-layer-link-input', { visible: true, timeout: 3000 }).catch(() => null);
                inputCtx = 'frame';
            }
            console.log(`[Module 4] Link input found: ${!!linkInput} (ctx: ${inputCtx})`);

            let finalLink = link;
            const isRawPhone = typeof link === 'string' && (link.match(/^[\d]{2,3}-[\d]{3,4}-[\d]{4}$/) || link.startsWith('010') || link.startsWith('02-'));
            if (isRawPhone) {
                finalLink = `tel:${link.replace(/[^\d]/g, '')}`;
            } else if (typeof link === 'string' && link.toLowerCase().startsWith('tel:')) {
                finalLink = link;
            }

            if (linkInput) {
                // 방법 1: ElementHandle.evaluate로 native setter 주입
                await linkInput.evaluate((el, value) => {
                    el.focus();
                    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(el, value);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }, finalLink);
                console.log(`[Module 4] Link value injected (native setter): ${finalLink}`);

                // 방법 2: 클릭 후 keyboard.type으로 실제 타이핑 (편집기 이벤트 리스너 보장)
                await linkInput.click({ clickCount: 3 });
                await utils.randomDelay(150, 250);
                await this.page.keyboard.type(finalLink, { delay: 30 });
                console.log(`[Module 4] Link value typed (keyboard): ${finalLink}`);

                await utils.randomDelay(500, 800);

                // 확인 버튼 — page → frame
                const applyBtn = await this.page.waitForSelector('button.se-custom-layer-link-apply-button', { visible: true, timeout: 3000 }).catch(() => null)
                              || await frame.waitForSelector('button.se-custom-layer-link-apply-button', { visible: true, timeout: 2000 }).catch(() => null);
                console.log(`[Module 4] Apply button found: ${!!applyBtn}`);

                if (applyBtn) {
                    await applyBtn.click();
                    console.log(`[Module 4] Link successfully applied: ${finalLink}`);
                } else {
                    console.log('[Module 4] Apply button not found, using Enter');
                    await this.page.keyboard.press('Enter');
                }
            } else {
                console.log('[Module 4] Link input not found in page or frame');
            }

            await utils.randomDelay(1000, 1500);
        } catch (e) {
            console.log(`[Module 4] Link apply error: ${e.message}`);
        }
    }

    async _insertQuote(frame, block, typeText, pressEnter) {
        const quoteBtn = await frame.$('.se-insert-quotation-default-toolbar-button, button[class*="quotation"]');
        if (!quoteBtn) return;
        await quoteBtn.click();
        await utils.randomDelay(2000, 3000);
        const styleClassMap = {
            'quote_default':        '.se-quotation-quotation_default-toolbar-button',
            'quote_vertical':       '.se-quotation-quotation_line-toolbar-button',
            'quote_balloon':        '.se-quotation-quotation_balloon-toolbar-button',
            'quote_line_quotation': '.se-quotation-quotation_line_quotation-toolbar-button',
            'quote_postit':         '.se-quotation-quotation_postit-toolbar-button',
            'quote_frame':          '.se-quotation-quotation_frame-toolbar-button',
        };
        const styleClass = styleClassMap[block.type] || styleClassMap['quote_default'];
        const fallbackKeyword = block.type.replace('quote_', '').replace('_', '');
        const styleBtn = await frame.$(styleClass + ', button[class*="' + fallbackKeyword + '"]');
        if (styleBtn) await styleBtn.click();
        await utils.randomDelay(1000, 1500);
        await typeText(block.content);

        // 출처 — 실제 네이버 에디터에서 확인한 구조상 출처 입력란도 본문과 똑같은
        // se-text-paragraph 문단이라 클래스만으론 구분이 안 되고, 감싸는 요소에
        // "se-cite"가 들어있는 것으로만 구분된다. 문서 전체에서 .se-cite를 찾으면
        // 다른 인용구의 출처란을 잘못 집을 수 있으므로, 방금 타이핑한 캐럿이 속한
        // 인용구 컴포넌트(.se-component) 안에서만 상대적으로 찾는다.
        if (block.source) {
            const moved = await frame.evaluate(() => {
                const sel = window.getSelection();
                const node = sel && sel.anchorNode;
                const el = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
                const component = el ? el.closest('.se-component') : null;
                const citeTarget = component
                    ? component.querySelector('[class*="se-cite"] p, [class*="se-cite"] [contenteditable]')
                    : null;
                if (citeTarget) { citeTarget.focus(); citeTarget.click(); return true; }
                return false;
            });
            if (moved) {
                await utils.randomDelay(300, 500);
                await typeText(block.source);
            } else {
                console.log('[Module 4] 출처 입력란을 찾지 못해 출처 입력을 건너뜁니다.');
            }
        }

        console.log(`[Module 4] Finished typing quote. Exiting quote block...`);
        // pressEnter은 인용구 내부에 빈 줄을 만들어 소제목 아래 줄바꿈이 생기므로 제거
        await this.page.keyboard.press('Escape');
        await this.page.keyboard.press('ArrowDown');
        await utils.randomDelay(1500, 2000);
    }

    // 푸터 전용 인용구 삽입 — _insertQuote(원고 소제목용)와 완전 분리
    async _insertFooterQuote(frame, block, typeText, pressEnter) {
        const styleValueMap = {
            'quote_default':        'default',
            'quote_vertical':       'quotation_line',
            'quote_balloon':        'quotation_bubble',
            'quote_line_quotation': 'quotation_underline',
            'quote_postit':         'quotation_postit',
            'quote_frame':          'quotation_corner',
        };
        const dataValue = styleValueMap[block.type] || 'default';
        const optionClass = `.se-toolbar-option-insert-quotation-${dataValue}-button`;

        // 1. 드롭다운 토글 버튼 클릭 (ElementHandle.click → CDP Input 이벤트, isTrusted:true)
        const dropdownBtn = await frame.$('button[data-name="quotation"][data-type="icon-select"]');
        if (!dropdownBtn) {
            console.log('[Module 4] Dropdown toggle not found — aborting footer quote');
            return;
        }
        await dropdownBtn.click();
        console.log('[Module 4] Clicked dropdown toggle');
        await utils.randomDelay(2000, 2500);

        // 2. 드롭다운 열렸는지 확인
        const inDom = await frame.evaluate((sel) => !!document.querySelector(sel), optionClass);
        console.log(`[Module 4] inDom=${inDom}, style=${dataValue}`);

        if (inDom) {
            const styleBtn = await frame.$(optionClass);
            if (styleBtn) {
                await styleBtn.click();
                console.log(`[Module 4] Style option clicked: ${block.type}`);
            }
        } else {
            // 드롭다운이 열리지 않은 경우 — 메인 삽입 버튼으로 폴백 (default 스타일)
            console.log('[Module 4] Dropdown did not open — fallback to direct insert');
            const insertBtn = await frame.$('button[data-name="quotation"]:not([data-type="icon-select"])');
            if (insertBtn) await insertBtn.click();
        }
        await utils.randomDelay(1000, 1500);

        // 3. 인용구 블록 내부에 포커스 확보 후 내용 입력
        //    (버튼 클릭 후 커서가 인용구 내부에 있어야 typeText가 동작)
        await frame.evaluate(() => {
            const editable = document.querySelector(
                '.se-quotation-content [contenteditable], ' +
                '[class*="quotation"] [contenteditable], ' +
                '.se-content-smartblock [contenteditable]:last-of-type'
            );
            if (editable) { editable.focus(); editable.click(); }
        });
        await utils.randomDelay(300, 500);

        await typeText(block.content);
        console.log(`[Module 4] Footer quote content typed (style: ${block.type})`);
        await this.page.keyboard.press('Escape');
        await this.page.keyboard.press('ArrowDown');
        await utils.randomDelay(1000, 1500);
    }

    async _insertFooterSystem(frame, components, typeText, pressEnter) {
        console.log(`[Module 4] Starting Footer System insertion: ${components.length} items`);
        // 푸터 삽입 전 에디터 하단으로 확실히 이동
        await this.page.keyboard.press('PageDown');
        await utils.randomDelay(1000, 1500);

        for (const comp of components) {
            try {
                if (comp.type === 'IMAGE') {
                    let imgPath = comp.localPath || comp.url;
                    console.log(`[Module 4] Attempting to upload footer image: ${imgPath}`);

                    // URL이면 임시 파일로 다운로드
                    if (imgPath && (imgPath.startsWith('http://') || imgPath.startsWith('https://'))) {
                        imgPath = await downloadToTemp(imgPath);
                        if (!imgPath) {
                            console.error(`[Module 4] Footer image download failed`);
                            continue;
                        }
                    }

                    if (!fs.existsSync(imgPath)) {
                        console.error(`[Module 4] Footer image file NOT found at: ${imgPath}`);
                        continue;
                    }
                    await this._insertImageModule(frame, imgPath, comp.link_value, comp.link_type);
                } else if (comp.type === 'TEXT') {
                    console.log(`[Module 4] Typing footer text (align: ${comp.align || 'center'})...`);
                    // 1. 정렬 드롭다운 열기 (네이버 스마트에디터 실제 DOM 기준)
                    const alignDropdown = await frame.$('button[data-name="align-drop-down-with-justify"][data-type="drop-down"]').catch(() => null);
                    if (alignDropdown) {
                        await alignDropdown.click();
                        await utils.randomDelay(400, 600);
                        // 2. 정렬 옵션 버튼 직접 클릭
                        const alignOptionMap = {
                            left:   '.se-toolbar-option-align-left-button',
                            center: '.se-toolbar-option-align-center-button',
                            right:  '.se-toolbar-option-align-right-button',
                        };
                        const optionSel = alignOptionMap[comp.align] || alignOptionMap['center'];
                        await frame.evaluate((sel) => {
                            const btn = document.querySelector(sel);
                            if (btn) btn.click();
                        }, optionSel);
                        await utils.randomDelay(200, 400);
                    }
                    await typeText(comp.content);
                    await pressEnter(2);
                } else if (comp.type === 'QUOTE' && comp.content?.trim()) {
                    console.log(`[Module 4] Inserting footer quote (style: ${comp.quote_style || 'quote_default'})...`);
                    await this._insertFooterQuote(frame, { type: comp.quote_style || 'quote_default', content: comp.content.trim() }, typeText, pressEnter);
                    await pressEnter(1);
                } else if (comp.type === 'MAP' && comp.address) {
                    console.log(`[Module 4] Inserting footer map: ${comp.address}`);
                    await this._insertMap(frame, comp.address);
                    this.businessShown.map = true;
                }
            } catch (e) { 
                console.error(`[Module 4] Footer item insertion failed: ${e.message}`);
                // 오류 발생 시 다음 항목을 위해 보정용 엔터 입력
                await pressEnter(1);
            }
        }
        console.log(`[Module 4] Footer System insertion finished.`);
    }

    async _insertImageModule(frame, imgPathOrUrl, link = null, linkType = 'url') {
        process.stdout.write(`[Module 4] Uploading image: ${imgPathOrUrl}... `);
        if (!imgPathOrUrl || imgPathOrUrl.startsWith('http')) {
            console.log('FAIL (Not a local path)');
            return; 
        }
        const success = await this._uploadImageWithRetryAndLink(frame, imgPathOrUrl, link, async (c) => {
            for (let i = 0; i < c; i++) await this.page.keyboard.press('Enter');
        });
        
        if (success) {
            console.log('SUCCESS');
            await this.page.keyboard.press('Enter'); // 이미지 뒤에 여분의 엔터로 스타일 꼬임 방지
            await utils.randomDelay(1000, 1500);
        } else {
            console.log('FAILED');
        }
    }

    async _insertMap(frame, address) {
        const placeHandle = await frame.evaluateHandle(() => {
            const btns = document.querySelectorAll('.se-toolbar-item button');
            return Array.from(btns).find(b => b.innerText?.includes('\uC7A5\uC18C') || b.title?.includes('\uC7A5\uC18C'));
        });
        const btn = await placeHandle.asElement();
        if (btn) {
            await btn.click();
            await utils.randomDelay(4000, 6000);
            await this.page.keyboard.type(address);
            await this.page.keyboard.press('Enter');
            await utils.randomDelay(4000, 5000);
            await frame.evaluate(() => document.querySelector('.se-place-add-button')?.click());
            await utils.randomDelay(2000, 3000);
            await frame.evaluate(() => document.querySelector('.se-popup-button-confirm:not(:disabled)')?.click());
            await utils.randomDelay(4000, 6000);
            await this.page.keyboard.press('ArrowUp');
            const alignBtn = await frame.$('.se-align-center-toolbar-button, button[class*="align_center"]');
            if (alignBtn) await alignBtn.click();
            await utils.randomDelay(1000, 1500);
            await this.page.keyboard.press('ArrowDown');
            await this.page.keyboard.press('Enter');
        }
    }

    _parseBlocks(content, assetReport, businessData = {}) {
        const tokens = [];
        let remaining = content;
        while (remaining.length > 0) {
            const vMatch = remaining.match(/\[QUOTE_?VERTICAL\]/i);
            const vi = vMatch ? vMatch.index : -1;
            const pMatch = remaining.match(/\[QUOTE_?POSTIT\]/i);
            const pi = pMatch ? pMatch.index : -1;
            const dMatch = remaining.match(/\[QUOTE_?DEFAULT\]/i);
            const di = dMatch ? dMatch.index : -1;
            const baMatch = remaining.match(/\[QUOTE_?BALLOON\]/i);
            const bai = baMatch ? baMatch.index : -1;
            const lqMatch = remaining.match(/\[QUOTE_?LINE_?QUOTATION\]/i);
            const lqi = lqMatch ? lqMatch.index : -1;
            const frMatch = remaining.match(/\[QUOTE_?FRAME\]/i);
            const fri = frMatch ? frMatch.index : -1;
            const bi = remaining.search(/\[B\]/i);
            const mi = remaining.search(/\[BUSINESS_?MAP_?BLOCK\]/i);
            const ci = remaining.search(/\[BUSINESS_?CTA_?BANNER\]/i);
            const imageMatch = remaining.match(/\[IMAGE_?ANCHOR_?(?:\s*)(\d+)\]/i);
            const ii = imageMatch ? imageMatch.index : -1;
            // 스티커 태그는 아직 실제 네이버 에디터에 붙일 검증된 셀렉터가 없어 이미지처럼
            // 삽입하지 못한다 — 대괄호가 그대로 텍스트로 노출되는 것보다는 조용히 제거한다.
            const stMatch = remaining.match(/\[STICKER_[\w-]+\]/i);
            const sti = stMatch ? stMatch.index : -1;

            const matches = [
                { type: 'quote_vertical', index: vi, match: vMatch },
                { type: 'quote_postit', index: pi, match: pMatch },
                { type: 'quote_default', index: di, match: dMatch },
                { type: 'quote_balloon', index: bai, match: baMatch },
                { type: 'quote_line_quotation', index: lqi, match: lqMatch },
                { type: 'quote_frame', index: fri, match: frMatch },
                { type: 'image', index: ii, match: imageMatch },
                { type: 'bold', index: bi },
                { type: 'map', index: mi, regex: /\[BUSINESS_?MAP_?BLOCK\]/i },
                { type: 'cta_banner', index: ci, regex: /\[BUSINESS_?CTA_?BANNER\]/i },
                { type: 'sticker', index: sti, match: stMatch }
            ].filter(m => m.index !== -1).sort((a, b) => a.index - b.index);

            if (matches.length === 0) {
                tokens.push({ type: 'text', content: remaining });
                break;
            }

            const first = matches[0];
            if (first.index > 0) tokens.push({ type: 'text', content: remaining.substring(0, first.index) });
            remaining = remaining.substring(first.index);

            if (first.type.startsWith('quote_')) {
                // 실제 매칭된 태그를 sTag로 사용 (언더바 유무 유연성 확보)
                const sTag = first.match[0];
                const eTag = sTag.replace('[', '[/');
                const eMatch = remaining.substring(sTag.length).match(new RegExp(eTag.replace('[', '\\[').replace(']', '\\]'), 'i'));
                if (eMatch) {
                    const eIdx = sTag.length + eMatch.index;
                    // 인용구 안에 남아있을 수 있는 파싱 마커 흔적 지우기
                    const rawInner = remaining.substring(sTag.length, eIdx).trim()
                        .replace(/\[\/?B\]/gi, '')
                        .replace(/\[IMAGE_ANCHOR_\d+\]/gi, '');
                    // "\n출처: xxx" 부분은 본문과 분리해 별도 출처 입력란에 타이핑한다
                    // (프론트엔드 QUOTE_SOURCE_SPLIT과 동일한 규칙).
                    const sourceMatch = rawInner.match(/\n출처:\s*([\s\S]*)$/);
                    const mainText = (sourceMatch ? rawInner.slice(0, sourceMatch.index) : rawInner)
                        .replace(/\n+/g, ' ')  // 소제목 내 줄바꿈 제거 (인용구 본문은 단일 줄)
                        .trim();
                    const sourceText = sourceMatch ? sourceMatch[1].replace(/\n+/g, ' ').trim() : '';

                    tokens.push({ type: first.type, content: mainText, source: sourceText });
                    // 소제목 태그 직후의 줄바꿈 제거 — AI가 [/QUOTE_VERTICAL]\n 으로 생성하면
                    // 그 \n이 텍스트 토큰이 되어 소제목 아래 빈 줄로 나타남
                    remaining = remaining.substring(eIdx + eMatch[0].length).replace(/^\n+/, '');
                } else {
                    remaining = remaining.substring(sTag.length);
                }
            } else if (first.type === 'bold') {
                const eMatch = remaining.substring(3).match(/\[\/B\]/i);
                if (eMatch) {
                    const eIdx = 3 + eMatch.index;
                    tokens.push({ type: 'bold', content: remaining.substring(3, eIdx) });
                    remaining = remaining.substring(eIdx + 4);
                } else {
                    remaining = remaining.substring(3);
                }
            } else if (first.type === 'image') {
                const id = parseInt(first.match[1]);
                tokens.push({ type: 'image', id });
                remaining = remaining.substring(first.match[0].length);
            } else if (first.type === 'map') {
                tokens.push({ type: 'map', address: businessData.map_address });
                const mMatch = remaining.match(first.regex);
                remaining = remaining.substring(mMatch ? mMatch[0].length : 0);
            } else if (first.type === 'cta_banner') {
                tokens.push({ type: 'cta_banner' });
                const cMatch = remaining.match(first.regex);
                remaining = remaining.substring(cMatch ? cMatch[0].length : 0);
            } else if (first.type === 'sticker') {
                console.log(`[Module 4] Skipping unsupported sticker tag: ${first.match[0]}`);
                remaining = remaining.substring(first.match[0].length);
            }
        }
        return tokens;
    }
    /**
     * 헬퍼: 발행 설정 패널이 확실히 열려 있는지 보장합니다.
     * 1회 체크로 오판하는 것을 방지하기 위해 최대 3회 재시도합니다.
     */
    async _ensurePublishPanelOpen() {
        // 패널이 닫혀있는지 5회 확인 (각 800ms 간격) — 주제 팝업 닫힌 후 패널 재렌더링 대기
        let closedCount = 0;
        for (let i = 0; i < 5; i++) {
            const isOpen = await this._isPublishPanelOpen();
            if (isOpen) {
                this._logDetail(`[패널확인] 발행 패널 열림 확인 (${i + 1}회째)`);
                return;
            }
            closedCount++;
            await utils.randomDelay(800, 1000);
        }
        // 5회 모두 닫힌 경우에만 재오픈
        this._logDetail('[패널강제] 발행 패널이 닫혀 있어 다시 엽니다.');
        await this._clickTopPublishButton();
        await utils.randomDelay(3000, 4000); // 패널 완전 로드 대기
    }
}

module.exports = ExecutionAgent;
