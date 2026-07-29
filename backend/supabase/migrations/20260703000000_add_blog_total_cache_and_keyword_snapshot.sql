-- 캐시 테이블: 키워드별 최신 블로그 발행량
CREATE TABLE blog_total_cache (
  keyword     TEXT PRIMARY KEY,
  blog_total  BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 스냅샷 테이블: 주차별 계정 컨셉-키워드 명단
CREATE TABLE keyword_snapshot (
  id              BIGSERIAL PRIMARY KEY,
  snapshot_date   DATE NOT NULL,
  concept         TEXT NOT NULL CHECK (concept IN (
    '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용',
    '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
    'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문'
  )),
  keyword         TEXT NOT NULL,
  search_volume   INT,
  comp_idx        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, concept, keyword)
);

CREATE INDEX idx_snapshot_date ON keyword_snapshot(snapshot_date);
CREATE INDEX idx_snapshot_concept ON keyword_snapshot(concept);
