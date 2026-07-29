-- concept은 이제 naver_accounts에서 실제 사용 중인 값을 동적으로 조회해서 쓰므로,
-- 고정된 값 목록으로 제한하는 CHECK 제약을 제거한다.
-- (그리드 옵션이 32개나 되고, 예전 자유입력 계정의 값도 있어 고정 목록으로는
--  검증이 불가능함 — accounts/page.js:6-23의 NAVER_CATEGORIES 참고)
ALTER TABLE keyword_snapshot DROP CONSTRAINT IF EXISTS keyword_snapshot_concept_check;
