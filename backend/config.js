const path = require('path');
require('dotenv').config();

/**
 * Shared Configuration for Naver Blog Automation System
 */
const config = {
    // API Keys
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    skipImageGen: process.env.SKIP_IMAGE_GEN === 'true',
    useDummyContent: process.env.USE_DUMMY_CONTENT === 'true',

    // Naver Blog Settings
    naver: {
        id: process.env.NAVER_ID || '',
        password: process.env.NAVER_PW || '',
        loginUrl: 'https://nid.naver.com/nidlogin.login',
        writeUrl: (blogId) => `https://blog.naver.com/${blogId || process.env.NAVER_ID}?Redirect=Write`,
        category: process.env.NAVER_CATEGORY || '해외여행',
    },

    // File Paths
    paths: {
        root: path.resolve(__dirname),
        assets: path.resolve(__dirname, 'assets'),
        logs: path.resolve(__dirname, 'logs'),
        temp: path.resolve(__dirname, 'tmp', 'blog_upload'),
    },

    // Image Generation Settings
    image: {
        count: 8,
        format: 'jpg',
        prefix: 'post_img_',
        style: 'Realistic, No Text, 16:9 Aspect Ratio',
        width: 1920,
        height: 1080,
    },

    // Human-like Behavior Settings
    humanlike: {
        typeDelay: { min: 50, max: 150 },       // ms per character
        actionDelay: { min: 2000, max: 5000 },   // ms between actions
        scrollDelay: { min: 800, max: 2500 },    // ms between scrolls
        dwellTime: { min: 60000, max: 180000 },  // ms for reading (1-3 min)
    },

    // Module 5: Social Distribution
    social: {
        agentCount: parseInt(process.env.AGENT_COUNT || '3'),
        schedulingWindow: 24 * 60 * 60 * 1000,  // 24 hours in ms
        proxyList: (process.env.PROXY_LIST || '').split(',').filter(Boolean),
    },
};

module.exports = config;
