// naver_accounts.naver_id는 "gktla2@naver.com"처럼 로그인용 이메일 형식으로 저장된 경우가 있다.
// 화면에는 "@" 뒤 도메인 없이 아이디 부분만 보여준다 (백엔드에서 실제 블로그 ID를 뽑을 때
// 쓰는 naver_id.trim().split('@')[0] 관례와 동일).
export function displayNaverId(naverId) {
    return naverId?.trim().split('@')[0] || '';
}
