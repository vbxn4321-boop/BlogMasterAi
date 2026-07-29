const SmartIntake = require('./module1_intake');
const ContentFactory = require('./module2_factory');
const AssetManager = require('./module3_assets');
const ExecutionAgent = require('./module4_executor');
const SocialSynergy = require('./module5_synergy');
const config = require('./config');
const utils = require('./utils');
const fs = require('fs');
const path = require('path');

/**
 * ═══════════════════════════════════════════════════════════════
 *  Naver Blog Automation System - Main Orchestrator
 *  Zero-Touch Pipeline: Intake → Content → Assets → Post → Synergy
 * ═══════════════════════════════════════════════════════════════
 */
class BlogAutomation {
    constructor() {
        this.apiKey = config.geminiApiKey;
        this.results = {
            module1: null,
            module2: null,
            module3: null,
            module4: null,
            module5: null,
        };
    }

    /**
     * Validate environment before starting
     */
    validateEnv() {
        const errors = [];
        if (!this.apiKey) errors.push('GEMINI_API_KEY is missing');
        if (!config.naver.id) errors.push('NAVER_ID is missing');

        if (errors.length > 0) {
            console.error('═══ ENVIRONMENT ERRORS ═══');
            errors.forEach(e => console.error(`  ✗ ${e}`));
            console.error('Please configure .env file (see .env.example)');
            return false;
        }
        return true;
    }

    /**
     * ── Step 1: Smart Intake ──
     */
    async runModule1(input) {
        console.log('\n═══════════════════════════════════════');
        console.log('  📡 Module 1: Smart Intake');
        console.log('═══════════════════════════════════════');

        const intake = new SmartIntake(this.apiKey);
        this.results.module1 = await intake.process(input);

        console.log(`  ✓ Input Type: ${this.results.module1.input_type}`);
        console.log(`  ✓ Main Keyword: ${this.results.module1.target_keywords.main}`);
        console.log(`  ✓ Sub Keywords: ${this.results.module1.target_keywords.sub.join(', ')}`);

        utils.writeLog(config.paths.logs, 'module1_data_asset', this.results.module1);
        return this.results.module1;
    }

    /**
     * ── Step 2: Content Factory ──
     */
    async runModule2() {
        if (!this.results.module1) throw new Error('Module 1 must run first');

        console.log('\n═══════════════════════════════════════');
        console.log('  ✍️  Module 2: Content Factory');
        console.log('═══════════════════════════════════════');

        let customInstructions = {};

        try {
            const customPath = path.join(config.paths.root, 'custom_prompts.md');
            if (fs.existsSync(customPath)) {
                const raw = fs.readFileSync(customPath, 'utf8');
                // Use a more robust split-based parsing
                const sections = raw.split(/## \d+\./);
                if (sections.length >= 3) {
                    customInstructions = {
                        content_prompt: sections[1].trim(),
                        custom_instructions: sections[2].trim()
                    };
                    console.log('  ✓ Custom prompts loaded successfully.');
                }
            }
        } catch (e) {
            console.warn(`  ! Failed to load custom prompts: ${e.message}`);
        }

        const factory = new ContentFactory(this.apiKey);
        this.results.module2 = await factory.generate(this.results.module1, customInstructions);

        console.log(`  ✓ Title: ${this.results.module2.title}`);
        console.log(`  ✓ Content Length: ${this.results.module2.content.length} chars`);

        utils.writeLog(config.paths.logs, 'module2_content', {
            title: this.results.module2.title,
            contentLength: this.results.module2.content.length,
            fullContent: this.results.module2.content,
            image_prompts: this.results.module2.image_prompts,
            hashtags: this.results.module2.hashtags,
            seo_guidelines: this.results.module2.seo_guidelines
        });
        return this.results.module2;
    }

    /**
     * ── Step 3: Asset Manager ──
     */
    async runModule3() {
        if (!this.results.module2) throw new Error('Module 2 must run first');
        if (!this.results.module1) throw new Error('Module 1 must run first');

        console.log('\n═══════════════════════════════════════');
        console.log('  🖼️  Module 3: Asset Manager');
        console.log('═══════════════════════════════════════');

        const assets = new AssetManager();
        const keyword = this.results.module1.target_keywords.main;
        const title = this.results.module2.title;
        this.results.module3 = await assets.generateAll(this.results.module2.image_prompts || [], keyword, title);

        console.log(`  ✓ Status: ${this.results.module3.asset_status}`);
        console.log(`  ✓ Images: ${this.results.module3.image_count}/${this.results.module3.total_expected}`);

        return this.results.module3;
    }

    /**
     * ── Step 4: Execution Agent (Local) ──
     */
    async runModule4() {
        console.log('\n═══════════════════════════════════════');
        console.log('  🤖 Module 4: Local Execution Engine');
        console.log('═══════════════════════════════════════');

        const executor = new ExecutionAgent();
        try {
            // 1. 브라우저 실행 및 로그인
            await executor.launch(config.naver.id, config.naver.pw);
            
            // 2. 에디터 접속 및 준비
            await executor.prepareEditor();

            // 3. 비즈니스 푸터 데이터 준비 (이미 존재 여부 확인 로그 포함)
            const footer1 = path.join(config.paths.root, 'temp_footer_1772127960895.png');
            const footer2 = path.join(config.paths.root, 'temp_footer_1772127640470.png');
            
            console.log(`[Main] Preparing footer images: \n  1: ${footer1} (Exists: ${fs.existsSync(footer1)})\n  2: ${footer2} (Exists: ${fs.existsSync(footer2)})`);

            const businessData = {
                footer_components: [
                    { type: 'IMAGE', localPath: footer1 },
                    { type: 'IMAGE', localPath: footer2 }
                ]
            };

            // 4. 실제 원고 게시 실행
            await executor.execute(this.results.module2, this.results.module3, businessData);
            
            console.log('  ✓ Local Automation Complete.');
            this.results.module4 = { status: 'COMPLETE' };
            return true;
        } catch (error) {
            console.error(`  ✗ Execution Error: ${error.message}`);
            throw error;
        } finally {
            await executor.close();
        }
    }

    /**
     * ── Step 5: Social Synergy ──
     */
    async runModule5(postUrl) {
        if (!this.results.module1) throw new Error('Module 1 must run first');

        console.log('\n═══════════════════════════════════════');
        console.log('  🚀 Module 5: Social Distribution & Synergy');
        console.log('═══════════════════════════════════════');

        const synergy = new SocialSynergy();
        const schedule = synergy.buildSchedule(
            postUrl || 'https://blog.naver.com/pending',
            this.results.module1.target_keywords
        );
        this.results.module5 = synergy.buildReport();

        console.log(`  ✓ Agents: ${this.results.module5.interaction_summary.agent_rotation_count}`);
        console.log(`  ✓ Interactions: ${this.results.module5.interaction_summary.total_scheduled_interactions}`);

        return this.results.module5;
    }

    /**
     * ═══ FULL PIPELINE ═══
     */
    async runFullPipeline(input, isMock = false) {
        console.log('╔═══════════════════════════════════════════════╗');
        console.log(`║  Naver Blog Automation - ${isMock ? 'MOCK' : 'FULL'} Pipeline Start  ║`);
        console.log('║  Mode: Zero-Touch | Automation: LOCAL ENGINE ║');
        console.log('╚═══════════════════════════════════════════════╝');

        if (!isMock && !this.validateEnv()) return null;

        try {
            if (isMock) {
                this.results.module1 = {
                    input_type: 'Text',
                    concept: 'Travel_Agency',
                    target_keywords: { main: '스위스 효도여행', sub: ['스위스 7박9일', '융프라우'] }
                };

                this.results.module2 = {
                    title: '🏔️ 스위스 7박 9일 부모님 효도여행, 실패 없는 완벽 코스 & 일정 총정리 ✨',
                    content: `부모님과 함께하는 여행, 설레기도 하지만 한편으론 걱정도 많으실 텐데요? 😊
그중에서도 **스위스**는 부모님들의 로망 1순위 지역이지만, 높은 지대와 기차 이동 등 챙길 게 많아 고민이 깊어지는 곳이기도 해요. 

[IMAGE_ANCHOR_1]

오늘은 제가 그런 고민들을 싹~ 해결해 드릴게요! 부모님의 체력을 최우선으로 생각하면서도, 스위스의 환상적인 풍경을 놓치지 않는 **7박 9일 완벽 코스**를 준비했답니다. 🇨🇭✨

[QUOTEVERTICAL]융프라우요흐, 아이거 익스프레스로 더 편하게![/QUOTEVERTICAL]

스위스 여행의 하이라이트인 **융프라우요흐**! ❄️ 옛날처럼 오래 기차를 타지 않아도 돼요. 최신형 곤돌라인 **아이거 익스프레스**를 타면 15분 만에 아이거 글레처까지 슝~ 이동할 수 있거든요. 🚠
부모님께서 추위로 고생하지 않으시도록 따뜻한 **컵라면** 한 그릇 드시는 것도 잊지 마세요! 😊🍜

🔸 **부모님 효도여행 핵심 포인트 3**
1. **이동 최소화**: 기차 일등석 또는 아이거 익스프레스로 편안하게! ✅
2. **숙소 고정**: 인터라켄이나 루체른 등 한곳에서 2~3박 하며 캐리어 이동 줄이기 ✨
3. **한식 챙기기**: 하루 한 끼는 익숙한 한식으로 속을 편안하게 🔸

부모님은 늘 "우리 걱정 마라, 너 좋은 대로 해라"라고 하시지만, 사실 자식과 함께하는 이 시간이 최고의 선물이라는 걸 잘 알고 있어요. 🏔️💕 더 늦기 전에 이번 기회에 부모님께 스위스의 눈부신 풍경을 선물해 보시는 것 어떨까요? ✨

[BUSINESSCTABANNER]

더 궁금하신 점이나 상세 일정이 필요하시면 언제든 **아래로 문의주세요!** 😊👇

📞 **전화문의**: 010-1234-5678
📱 **카카오톡**: @스위스여행도우미`,
                    image_prompts: [
                        "Wooden Chapel Bridge in Lucerne at sunset",
                        "Red Swiss mountain train climbing Mt. Rigi with green meadows",
                        "Eiger Express gondola with the majestic Eiger North Face background",
                        "Sphinx Observatory at Jungfraujoch surrounded by eternal snow",
                        "Cozy Swiss chalet in Lauterbrunnen with Staubbach Falls falling in the background",
                        "Elderly couple holding hands looking at Lake Brienz from a first-class train",
                        "Swiss cheese fondue table with a backdrop of the Matterhorn peak",
                        "Happy family taking a photo at Lucerne lake with swans"
                    ],
                    hashtags: ['스위스여행', '부모님효도여행', '스위스7박9일', '융프라우', '인터라켄', '효도여행추천']
                };
            } else {
                await this.runModule1(input);
                await this.runModule2();
            }

            console.log('\n  [!] CONTENT GENERATED.');

            if (process.argv.includes('--post')) {
                await this.runModule3();
                await this.runModule4();
                await this.runModule5();
            } else {
                console.log('  [!] PAUSING FOR USER REVIEW. (Use --post to automate)');
                return { status: 'AWAITING_REVIEW', content: this.results.module2 };
            }
        } catch (error) {
            console.error(`\n  ✗ Pipeline Error: ${error.message}`);
            throw error;
        }
    }
}

// ═══ CLI Entry Point ═══
if (require.main === module) {
    const args = process.argv.slice(2);
    const isMock = args.includes('--mock');
    const input = args.filter(a => !a.startsWith('--'))[0] || '스위스 7박 9일 부모님 효도여행 코스';

    const bot = new BlogAutomation();
    bot.runFullPipeline(input, isMock)
        .then(res => {
            if (res && res.status === 'AWAITING_REVIEW') {
                console.log('\n📋 [원고 검토 필수]');
                console.log('제목:', res.content.title);
                console.log('\n사용자가 승인하면 --post 플래그를 붙여 다시 실행하세요.');
            }
        })
        .catch(err => console.error('\nFatal:', err.message));
}

module.exports = BlogAutomation;
