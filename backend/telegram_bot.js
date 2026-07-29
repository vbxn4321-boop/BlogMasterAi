require('dotenv').config();
const axios = require('axios');

// 텔레그램 Bot API 얇은 래퍼. billing.js처럼 에러를 내부에서 잡아 { success:false, error }로
// 반환하고 절대 throw하지 않는다 — 호출부(웹훅 라우트/스케줄러)가 매번 try/catch 없이
// 결과만 확인하면 되게 하기 위함.

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text) {
    try {
        const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text,
        }, { timeout: 5000 });
        return { success: true, data: res.data.result };
    } catch (err) {
        const reason = err?.response?.data?.description || err.message;
        return { success: false, error: String(reason) };
    }
}

/**
 * buttons: [{ text, callback_data }, ...] — 한 줄짜리 인라인 키보드로 발송
 */
async function sendMessageWithButtons(chatId, text, buttons) {
    try {
        const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: {
                inline_keyboard: [buttons.map(b => ({ text: b.text, callback_data: b.callback_data }))],
            },
        }, { timeout: 5000 });
        return { success: true, data: res.data.result };
    } catch (err) {
        const reason = err?.response?.data?.description || err.message;
        return { success: false, error: String(reason) };
    }
}

/**
 * rows: [[{ text, callback_data }, ...], ...] — 여러 줄짜리 인라인 키보드로 발송
 * (sendMessageWithButtons는 한 줄짜리 키보드만 지원 — 옵션이 많은 질문(톤/카테고리)에 사용)
 */
async function sendMessageWithButtonRows(chatId, text, rows) {
    try {
        const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: {
                inline_keyboard: rows.map(row => row.map(b => ({ text: b.text, callback_data: b.callback_data }))),
            },
        }, { timeout: 5000 });
        return { success: true, data: res.data.result };
    } catch (err) {
        const reason = err?.response?.data?.description || err.message;
        return { success: false, error: String(reason) };
    }
}

/**
 * 콜백 버튼(인라인 키보드) 클릭에 반드시 응답해야 함 — 안 하면 텔레그램 앱에서
 * 버튼 로딩 스피너가 계속 돔 (프로토콜 필수사항, 요구사항 문서엔 없었지만 빠지면 안 됨).
 */
async function answerCallbackQuery(callbackQueryId, text) {
    try {
        const res = await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            ...(text ? { text } : {}),
        }, { timeout: 5000 });
        return { success: true, data: res.data.result };
    } catch (err) {
        const reason = err?.response?.data?.description || err.message;
        return { success: false, error: String(reason) };
    }
}

function verifyWebhookSecret(req) {
    return req.headers['x-telegram-bot-api-secret-token'] === process.env.TELEGRAM_WEBHOOK_SECRET;
}

module.exports = { sendMessage, sendMessageWithButtons, sendMessageWithButtonRows, answerCallbackQuery, verifyWebhookSecret };
