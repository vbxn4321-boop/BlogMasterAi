import { createClient } from '@/lib/supabase/client';

// 우리 자체 API 라우트(/api/...)는 Supabase 세션 쿠키로 인증한다. 액세스 토큰이
// 갱신 타이밍을 놓쳐 만료된 채로 요청이 나가면 401(Unauthorized)이 뜨는데, 이 경우
// 세션을 한 번 강제 갱신한 뒤 요청을 한 번만 재시도한다. 그래도 401이면 리프레시
// 토큰 자체가 죽은 것이므로 더 재시도하지 않고 그대로 반환한다(다시 로그인 필요).
export async function fetchWithAuthRetry(url, options) {
    const res = await fetch(url, options);
    if (res.status !== 401) return res;

    const supabase = createClient();
    const { error } = await supabase.auth.refreshSession();
    if (error) return res;

    return fetch(url, options);
}
