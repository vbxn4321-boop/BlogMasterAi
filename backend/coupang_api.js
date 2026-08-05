// 쿠팡 파트너스 오픈 API 연동 (상품 검색 + 딥링크 단축)
// 공식 스펙: HMAC-SHA256 서명 방식 (access-key / signed-date / signature)
// https://developers.coupangcorp.com/hc/ko

const crypto = require('crypto');
const axios = require('axios');

const DOMAIN = 'https://api-gateway.coupang.com';
const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

function isConfigured() {
    return !!(ACCESS_KEY && SECRET_KEY);
}

// datetime 포맷: yyMMdd'T'HHmmss'Z' (UTC)
function generateDatetime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
        `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function sign(method, pathWithQuery) {
    const datetime = generateDatetime();
    const message = datetime + method + pathWithQuery;
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(message).digest('hex');
    const authorization = `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
    return authorization;
}

async function request(method, path, query = '', body = null) {
    if (!isConfigured()) throw new Error('COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY가 설정되지 않았습니다.');
    const pathWithQuery = query ? `${path}?${query}` : path;
    const authorization = sign(method, pathWithQuery);

    const response = await axios({
        method,
        url: `${DOMAIN}${pathWithQuery}`,
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        data: body || undefined,
        timeout: 15000,
    });
    return response.data;
}

// 키워드로 상품 검색 (product_name_guess 기반 유사 상품 탐색용)
async function searchProducts(keyword, limit = 10) {
    const path = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
    const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
    const data = await request('GET', path, query);
    const products = data?.data?.productData || [];
    return products.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        productImage: p.productImage,
        productPrice: p.productPrice,
        productUrl: p.productUrl,
        isRocket: !!p.isRocket,
    }));
}

// 쿠팡 URL → 파트너스 단축 링크 변환 (고정댓글/설명란 삽입용)
async function createShortLink(url) {
    const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const data = await request('POST', path, '', { coupangUrls: [url] });
    return data?.data?.[0]?.shortenUrl || null;
}

module.exports = { isConfigured, searchProducts, createShortLink };
