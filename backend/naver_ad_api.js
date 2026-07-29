const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Naver Search Ad API (Keyword Tools) Utility
 */
class NaverAdAPI {
    constructor() {
        this.baseUrl = 'https://api.naver.com';
        this.customerId = process.env.NAVER_AD_CUSTOMER_ID;
        this.accessKey = process.env.NAVER_AD_ACCESS_KEY;
        this.secretKey = process.env.NAVER_AD_SECRET_KEY;
    }

    _generateSignature(timestamp, method, uri) {
        const message = `${timestamp}.${method}.${uri}`;
        return crypto
            .createHmac('sha256', this.secretKey)
            .update(message)
            .digest('base64');
    }

    /**
     * Fetch keyword data from Naver ad API
     * @param {string[]} keywords - Array of strings (max 5)
     */
    async getKeywordStats(keywords) {
        if (!this.accessKey || !this.secretKey || !this.customerId) {
            console.warn('[NaverAdAPI] API credentials missing, skipping real data fetch.');
            return null;
        }

        const timestamp = Date.now().toString();
        const method = 'GET';
        const uri = '/keywordstool';
        const params = {
            hintKeywords: keywords.join(','),
            showDetail: '1'
        };

        const signature = this._generateSignature(timestamp, method, uri);

        try {
            console.log(`[NaverAdAPI] Requesting: ${this.baseUrl}${uri} with keywords: ${params.hintKeywords}`);
            const response = await axios.get(`${this.baseUrl}${uri}`, {
                params,
                headers: {
                    'X-Timestamp': timestamp,
                    'X-API-KEY': this.accessKey,
                    'X-Customer': this.customerId,
                    'X-Signature': signature
                },
                timeout: 8000
            });

            return response.data.keywordList || [];
        } catch (error) {
            console.error('[NaverAdAPI] Request URI:', `${this.baseUrl}${uri}`);
            console.error('[NaverAdAPI] Params:', params);
            console.error('[NaverAdAPI] Error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
            return null;
        }
    }
}

module.exports = new NaverAdAPI();
