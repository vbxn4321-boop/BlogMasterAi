-- naver_accounts.concept이 예전 32개(복합) 목록으로 고정된 CHECK 제약에 묶여 있어서,
-- 새로 분리된 50개 단일 컨셉("디자인", "전시" 등)을 저장하지 못하는 문제를 해결한다.
-- (keyword_snapshot.concept과 동일한 이유로 제거 — 20260706120000 마이그레이션 참고)
ALTER TABLE naver_accounts DROP CONSTRAINT IF EXISTS naver_accounts_concept_check;
