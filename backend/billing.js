const { PortOneClient } = require('@portone/server-sdk');

// PortOne V2 정기결제(빌링키) REST 호출 모음. naver_ad_api.js처럼 이 프로젝트에서
// 외부 결제/광고 API를 감싸는 모듈들과 동일한 스타일(간단한 함수 export)을 따른다.

let client = null;
function getClient() {
    if (!client) {
        client = PortOneClient({
            secret: process.env.PORTONE_API_SECRET,
            storeId: process.env.PORTONE_STORE_ID,
        });
    }
    return client;
}

const PRO_PLAN_ORDER_NAME = '블로그 마스터 AI PRO 월 구독';

/**
 * 빌링키가 실제로 발급 완료 상태인지 서버에서 재검증한다.
 * (브라우저 SDK 응답만 믿지 않고 서버가 PortOne에 직접 물어봄)
 */
async function verifyBillingKey(billingKeyId) {
    const info = await getClient().payment.billingKey.getBillingKeyInfo({ billingKey: billingKeyId });
    return info.status === 'ISSUED';
}

/**
 * 빌링키로 1회 청구한다. 최초 구독 시작과 매달 자동 재청구 양쪽에서 재사용.
 * 실패해도 예외를 던지지 않고 { success:false, failureReason }를 반환한다 —
 * 호출부(라우트/스케줄러)가 매번 try/catch 없이 결과를 그대로 DB 로그에 남길 수 있게.
 */
async function chargeBillingKey({ billingKeyId, paymentId, userId, amount }) {
    try {
        const result = await getClient().payment.payWithBillingKey({
            paymentId,
            billingKey: billingKeyId,
            orderName: PRO_PLAN_ORDER_NAME,
            customer: { customerId: userId },
            amount: { total: amount },
            currency: 'KRW',
        });
        return {
            success: true,
            pgTxId: result.payment.pgTxId,
            paidAt: result.payment.paidAt,
        };
    } catch (err) {
        const reason = err?.data?.type || err?.message || 'UNKNOWN_ERROR';
        return { success: false, failureReason: String(reason) };
    }
}

module.exports = { verifyBillingKey, chargeBillingKey, PRO_PLAN_ORDER_NAME };
