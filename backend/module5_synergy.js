const config = require('./config');
const utils = require('./utils');

/**
 * Module 5: Social Distribution & Synergy
 * Role: Digital Marketing Analyst & Interaction Modeler
 * 
 * Generates interaction schedules and browser automation scripts
 * for organic search entry, retention modeling, and engagement signals.
 */
class SocialSynergy {
    constructor() {
        this.schedule = [];
        this.interactionLog = [];
    }

    /**
     * Build a 24-hour interaction schedule with irregular intervals
     * @param {string} postUrl - Published blog post URL
     * @param {Object} keywords - Keywords from Module 1
     * @returns {Object[]} Scheduled interaction tasks
     */
    buildSchedule(postUrl, keywords) {
        const agentCount = config.social.agentCount;
        const totalInteractions = agentCount * 2; // Each agent visits twice
        const windowMs = config.social.schedulingWindow;

        // Generate irregular timestamps over 24h
        const timestamps = [];
        for (let i = 0; i < totalInteractions; i++) {
            timestamps.push(utils.randomInt(
                Math.floor(windowMs * 0.05),  // Start at least 5% into the window
                Math.floor(windowMs * 0.95)   // End before 95% of the window
            ));
        }
        timestamps.sort((a, b) => a - b);

        // Assign each timestamp to an agent and interaction type
        this.schedule = timestamps.map((offset, idx) => {
            const agentId = (idx % agentCount) + 1;
            const isOrganic = idx % 2 === 0;

            return {
                order: idx + 1,
                agentId: `visitor_segment_${agentId}`,
                delayFromPublish: offset,
                delayFormatted: this._formatMs(offset),
                entryType: isOrganic ? 'ORGANIC_SEARCH' : 'REFERRAL',
                keyword: isOrganic ? keywords.main : null,
                referralSource: !isOrganic ? this._getRandomReferral() : null,
                postUrl,
                actions: this._buildVisitorActions(isOrganic),
            };
        });

        console.log(`[Module 5] Schedule built: ${this.schedule.length} interactions across ${agentCount} agents`);
        return this.schedule;
    }

    /**
     * Build the action sequence for a single visitor simulation
     * @param {boolean} isOrganic - Whether this is an organic search entry
     */
    _buildVisitorActions(isOrganic) {
        const dwellTime = utils.randomInt(
            config.humanlike.dwellTime.min,
            config.humanlike.dwellTime.max
        );

        const actions = [];

        // Entry Phase
        if (isOrganic) {
            actions.push({
                type: 'SEARCH_ENTRY',
                description: '네이버 검색창에서 키워드 입력 후 결과 페이지에서 블로그 게시물 클릭',
                steps: [
                    'Navigate to naver.com',
                    'Type keyword into search bar (char-by-char with random delays)',
                    'Wait for search results to load',
                    'Scroll through VIEW/SmartBlock section',
                    'Find and click the target blog post'
                ]
            });
        } else {
            actions.push({
                type: 'REFERRAL_ENTRY',
                description: '외부 링크를 통한 블로그 유입 시뮬레이션',
                steps: [
                    'Navigate to referral source',
                    'Find or simulate link click',
                    'Redirect to blog post'
                ]
            });
        }

        // Reading Phase
        const scrollCount = utils.randomInt(8, 15);
        actions.push({
            type: 'READ_SIMULATION',
            description: `본문 읽기 시뮬레이션 (${Math.round(dwellTime / 1000)}초 체류)`,
            dwellTimeMs: dwellTime,
            scrollActions: scrollCount,
            scrollPattern: 'IRREGULAR', // Not linear
            mouseMovement: true,
            steps: [
                `Scroll down in ${scrollCount} irregular intervals`,
                'Pause at images for 3-5 seconds',
                'Move mouse naturally over text',
                `Total dwell time: ${Math.round(dwellTime / 1000)} seconds`
            ]
        });

        // Engagement Phase (probabilistic)
        const willLike = Math.random() > 0.3;   // 70% chance
        const willSave = Math.random() > 0.6;   // 40% chance
        const willShare = Math.random() > 0.8;  // 20% chance

        if (willLike) {
            actions.push({
                type: 'ENGAGEMENT',
                signal: 'LIKE',
                description: '공감 버튼 클릭',
                selector: '.u_likeit_list_btn, .sympathy_btn',
                delay: utils.randomInt(1000, 3000)
            });
        }

        if (willSave) {
            actions.push({
                type: 'ENGAGEMENT',
                signal: 'SAVE',
                description: '보관함 저장',
                selector: '.btn_keep, .save_btn',
                delay: utils.randomInt(2000, 5000)
            });
        }

        if (willShare) {
            actions.push({
                type: 'ENGAGEMENT',
                signal: 'SHARE',
                description: '공유하기 (URL 복사)',
                delay: utils.randomInt(1000, 4000)
            });
        }

        return actions;
    }

    /**
     * Generate a browser subagent task for a scheduled interaction
     * @param {Object} scheduled - Single scheduled interaction
     * @returns {string} Task description for browser subagent
     */
    generateAgentTask(scheduled) {
        let task = `## ${scheduled.agentId} - Interaction #${scheduled.order}\n\n`;

        if (scheduled.entryType === 'ORGANIC_SEARCH') {
            task += `1. https://www.naver.com 으로 이동\n`;
            task += `2. 검색창에 "${scheduled.keyword}" 를 한 글자씩 천천히 입력 (각 글자 사이 100-300ms 대기)\n`;
            task += `3. 검색 결과 페이지에서 VIEW 탭 또는 스마트블록 영역 확인\n`;
            task += `4. 타겟 블로그 게시물을 찾아 클릭\n`;
        } else {
            task += `1. ${scheduled.referralSource} 로 이동 (Referral 시뮬레이션)\n`;
            task += `2. 해당 블로그 포스트 URL(${scheduled.postUrl})로 진입\n`;
        }

        for (const action of scheduled.actions) {
            if (action.type === 'READ_SIMULATION') {
                task += `\n### 읽기 시뮬레이션\n`;
                task += `- ${action.scrollActions}회 불규칙 스크롤\n`;
                task += `- 총 체류시간: ${Math.round(action.dwellTimeMs / 1000)}초\n`;
                task += `- 이미지 위치에서 3-5초 추가 정지\n`;
            } else if (action.type === 'ENGAGEMENT') {
                task += `\n### ${action.description}\n`;
                task += `- 클릭 후 ${action.delay}ms 대기\n`;
            }
        }

        return task;
    }

    /**
     * Get a random referral source for diversity
     */
    _getRandomReferral() {
        const sources = [
            'https://cafe.naver.com',
            'https://band.us',
            'https://www.instagram.com',
            'https://m.blog.naver.com',
            'https://www.facebook.com',
        ];
        return sources[utils.randomInt(0, sources.length - 1)];
    }

    /**
     * Format ms to human-readable time
     */
    _formatMs(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        return `발행 후 ${hours}시간 ${minutes}분`;
    }

    /**
     * Build the final interaction summary report
     */
    buildReport() {
        const engagementCounts = { LIKE: 0, SAVE: 0, SHARE: 0 };
        let totalDwell = 0;
        let organicCount = 0;

        for (const item of this.schedule) {
            if (item.entryType === 'ORGANIC_SEARCH') organicCount++;
            for (const action of item.actions) {
                if (action.type === 'READ_SIMULATION') {
                    totalDwell += action.dwellTimeMs;
                }
                if (action.type === 'ENGAGEMENT') {
                    engagementCounts[action.signal]++;
                }
            }
        }

        const avgDwell = this.schedule.length > 0
            ? Math.round(totalDwell / this.schedule.length / 1000)
            : 0;

        const report = {
            distribution_status: 'READY',
            interaction_summary: {
                organic_search_entry: `${organicCount}/${this.schedule.length} entries`,
                avg_dwell_time: `${avgDwell}s`,
                social_signals: Object.entries(engagementCounts)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `${k}(${v})`),
                agent_rotation_count: config.social.agentCount,
                total_scheduled_interactions: this.schedule.length,
            },
            schedule_preview: this.schedule.map(s => ({
                order: s.order,
                agent: s.agentId,
                timing: s.delayFormatted,
                type: s.entryType
            }))
        };

        utils.writeLog(config.paths.logs, 'module5_synergy_report', report);
        console.log(`[Module 5] Report built: ${this.schedule.length} interactions planned`);
        return report;
    }
}

module.exports = SocialSynergy;
