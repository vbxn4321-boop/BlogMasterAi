// Supabase/Postgres 원본 에러(코드, 영문 드라이버 메시지)를 사용자에게 보여줄 한글
// 안내문으로 바꿔준다. 우리가 직접 new Error('한글 메시지')로 던진 경우는 이미 사람이
// 쓴 문장이므로 그대로 사용하고, DB에서 올라온 원본(영문, code 필드 존재)만 대체한다.
// 한글 포함 여부로 "우리가 쓴 메시지 vs 드라이버가 준 원본"을 구분한다 — 우리가 쓰는
// 메시지는 항상 한글이고, Postgres/드라이버 메시지는 항상 영문이라 안전하게 구분된다.

const PG_ERROR_MESSAGES = {
    '22003': '입력하신 값이 허용 범위를 벗어났습니다. 더 작은 값을 입력해주세요.',
    '22001': '입력하신 내용이 너무 깁니다. 글자 수를 줄여주세요.',
    '22P02': '입력한 값의 형식이 올바르지 않습니다.',
    '23505': '이미 등록되어 있는 값입니다. 중복해서 등록할 수 없습니다.',
    '23503': '연결된 다른 데이터가 있어 처리할 수 없습니다.',
    '23502': '필수 항목이 비어 있습니다.',
    '42501': '이 작업을 수행할 권한이 없습니다.',
    'PGRST116': '해당 데이터를 찾을 수 없습니다.',
};

const DEFAULT_FALLBACK = '일시적인 서버 시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

export function toKoreanErrorMessage(err, fallback = DEFAULT_FALLBACK) {
    if (!err) return fallback;

    const code = err.code;
    if (code && PG_ERROR_MESSAGES[code]) return PG_ERROR_MESSAGES[code];

    const rawMsg = typeof err === 'string' ? err : err.message;
    if (typeof rawMsg !== 'string' || !rawMsg.trim()) return fallback;

    // 개발용 기술 에러 (SyntaxError, Unexpected identifier, TypeError, Cannot read, Failed to fetch 등)
    const isTechnicalError = /SyntaxError|TypeError|Unexpected identifier|Unexpected token|Failed to fetch|NetworkError|Cannot read properties/i.test(rawMsg);

    if (isTechnicalError) {
        const summaryMatch = rawMsg.match(/Unexpected identifier '([^']+)'|SyntaxError: ([^\n]+)/i);
        const detail = summaryMatch ? (summaryMatch[1] || summaryMatch[2]) : rawMsg.slice(0, 35);
        return `일시적인 시스템 처리 오류가 발생했습니다. (${detail})\n개발팀에 자동 보고되었으며 원인을 확인 중입니다. 잠시 후 다시 시도해 주세요!`;
    }

    if (/[가-힣]/.test(rawMsg)) {
        return rawMsg;
    }

    return fallback;
}
