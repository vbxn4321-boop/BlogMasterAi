# Blog Master — 프로젝트 컨텍스트

## 프로젝트 개요
네이버 블로그 자동화 플랫폼. AI(Gemini)로 원고를 생성하고 Puppeteer로 네이버 블로그에 자동 발행하는 SaaS형 서비스.

## 모노레포 구조
```
blog-master/
├── backend/    # Node.js + Express 자동화 엔진 (포트 3001)
├── frontend/   # Next.js 대시보드 UI (포트 3000)
└── package.json
```

## 실행 방법
```bash
# 각각 폴더 진입 후 의존성 설치
cd backend && npm install
cd frontend && npm install

# 개발 서버
cd backend && npm run dev    # nodemon engine_api.js
cd frontend && npm run dev   # next dev
```

## 백엔드 핵심 파일
- `engine_api.js` — Express API 서버 진입점, 모든 라우트 정의
- `module1_intake.js` — URL/이미지 분석 및 키워드 데이터 수집
- `module2_factory.js` — Gemini AI 원고 생성 및 파싱 (핵심 프롬프트 포함)
- `module3_assets.js` — 이미지 생성 및 썸네일 합성 (Sharp)
- `module4_executor.js` — Puppeteer로 네이버 블로그 실제 발행
- `module5_synergy.js` — 연관 계정 시너지 로직
- `module6_ranking.js` — 순위 추적
- `scheduler.js` — node-cron 기반 예약 발행
- `prompt_vault.js` — 프롬프트 관리
- `prompts/` — 말투(tone) 및 카테고리별 프롬프트 파일

## 프론트엔드 핵심 파일
- `src/app/dashboard/post/page.js` — 새 포스팅 워크스페이스 (메인 UI)
- `src/app/dashboard/keywords/page.js` — 황금키워드 분석 탭
- `src/app/dashboard/accounts/page.js` — 네이버 계정 관리
- `src/app/dashboard/schedule/` — 예약 발행 관리
- `src/app/api/post/preview-stream/route.js` — SSE 스트리밍 원고 미리보기

## 주요 기술 결정사항
- **DB/Auth**: Supabase (인증 + 데이터 저장 + 스토리지)
- **AI**: Google Gemini API (원고 생성, 이미지 분석)
- **이미지**: Sharp로 썸네일 텍스트 직접 합성 (썸네일 스타일 4종, 글자색 선택)
- **자동화**: Puppeteer + stealth 플러그인으로 네이버 스마트에디터 조작
- **원고 포맷**: `[B]`, `[QUOTE_VERTICAL]`, `[IMAGE_ANCHOR_X]` 커스텀 태그 시스템

## 프롬프트 관련 주의사항
- `module2_factory.js` `parseOutput()` 함수에서 제목 후처리 수행
  - 연도(2026년 등) 제거: `\b(19|20)\d{2}년?\s*` 패턴
  - "AI" 단어 제거: `\bAI\s*(추천|와|...)?\s*` 패턴
- 프롬프트 금지 규칙: 제목에 AI 표현 및 연도 포함 금지

## 환경변수
**backend/.env** (직접 생성 필요)
```
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NAVER_AD_API_KEY=
NAVER_AD_SECRET_KEY=
NAVER_AD_CUSTOMER_ID=
PORT=3001
```

**frontend/.env.local** (직접 생성 필요)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 배포 계획 (미완료)
- Frontend → Vercel
- Backend → Railway 또는 VPS (Puppeteer 때문에 서버리스 불가)
- DB → Supabase (이미 운영 중)

## 협업 규칙
- git commit/push 전 반드시 사용자에게 먼저 확인할 것
