# Blog Master — 네이버 블로그 자동화 플랫폼

AI(Gemini)로 원고를 생성하고 Chrome 익스텐션으로 네이버 블로그에 자동 발행하는 SaaS형 서비스.

---

## 프로젝트 구조

```
blog-master/
├── backend/              # Node.js + Express 자동화 엔진 (포트 4000)
├── frontend/             # Next.js 대시보드 UI (포트 3000)
└── chrome-extension/     # Chrome MV3 익스텐션 (사용자 PC에서 발행 담당)
```

## 실행 방법

```bash
# 백엔드
cd backend && npm install && npm run dev   # port 4000

# 프론트엔드
cd frontend && npm install && npm run dev  # port 3000
```

## 환경변수

**backend/.env**
```
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NAVER_AD_API_KEY=
NAVER_AD_SECRET_KEY=
NAVER_AD_CUSTOMER_ID=
PORT=4000
PORTONE_API_SECRET=
PORTONE_STORE_ID=
PORTONE_CHANNEL_KEY=
PORTONE_WEBHOOK_SECRET=
PORTONE_PRO_PLAN_PRICE=29000
```

**frontend/.env.local**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:4000
ENGINE_API_URL=http://localhost:4000
ENGINE_API_SECRET=
NEXT_PUBLIC_PORTONE_STORE_ID=
NEXT_PUBLIC_PORTONE_CHANNEL_KEY=
NEXT_PUBLIC_PORTONE_PRO_PLAN_PRICE=29000
```

---

## Chrome 익스텐션

### 설치 방법
1. `chrome://extensions/` 접속 → 개발자 모드 ON
2. "압축 해제된 확장 프로그램 로드" → `chrome-extension/` 폴더 선택
3. 팝업 → 백엔드 URL + 설정 페이지에서 복사한 토큰 입력 → 연결

### 발행 흐름
```
[대시보드] "확장프로그램으로 발행" 클릭
        ↓
[백엔드] M1(키워드분석) + M2(원고생성) + M3(이미지생성) 실행
        ↓
[DB] posts.status = "pending_extension" + extension_device_id 저장
        ↓
[익스텐션] 30초마다 폴링 → 자신의 device_id job만 감지
        ↓
[익스텐션] 네이버 탭 열기 → CDP(chrome.debugger)로 에디터 자동조작
        ↓
[백엔드] 완료 보고 → posts.status = "success"
```

### device_id 라우팅
동일 계정으로 여러 PC에 익스텐션이 설치되어 있어도 **발행 요청을 보낸 PC의 익스텐션만** 해당 job을 처리합니다.
- Supabase `posts` 테이블에 `extension_device_id TEXT` 컬럼 추가됨 (이미 적용)

### 구현된 자동화 기능

| 기능 | 상태 | 비고 |
|------|------|------|
| 제목 입력 | ✅ | |
| 본문 입력 | ✅ | [B], [QUOTE_*], [IMAGE_ANCHOR_N] 커스텀 태그 파싱 |
| 이미지 업로드 | ✅ | chrome.downloads + DOM.setFileInputFiles |
| 이미지 링크 연결 | ✅ | URL/전화번호, 본문+푸터 모두 적용 |
| 지도 삽입 | ✅ | CDP hover → 추가 버튼 → 확인 |
| 푸터 시스템 | ✅ | TEXT/IMAGE/QUOTE/MAP 컴포넌트 |
| 카테고리 설정 | ✅ | |
| 주제 설정 | ✅ | |
| 공개/비공개 설정 | ✅ | |
| 해시태그 입력 | ✅ | |
| 댓글/공감 허용 설정 | ✅ | |
| 예약/즉시 발행 | ✅ | |

### Puppeteer와 비교

| 항목 | Puppeteer | 익스텐션 |
|------|-----------|---------|
| 실행 위치 | 서버(고정 IP) | 사용자 브라우저(실제 IP) |
| 로그인 | 자동화 | 기존 세션 활용 (캡차 없음) |
| 프록시 | ✅ | ❌ |
| 에러 재시도 | 상세 | 기본 수준 → **개선 예정** |

---

## 다음 작업 목록

- [ ] 이미지 링크 기능 실제 테스트 확인
- [ ] 카테고리/주제 설정 재시도 로직 강화 (Puppeteer 수준으로)
- [ ] 에러 발생 시 단계별 재시도 로직 추가

---

## 배포

- Frontend → Vercel (현재 ngrok으로 임시 운영 중)
- Backend → Railway 예정 (Puppeteer 때문에 서버리스 불가)
- DB → Supabase (운영 중)
- 익스텐션 → 압축 파일 배포 (앱스토어 미등록)

---

## 커밋 이력 (이전 저장소에서 이관)

### Backend (naver-blog-auto) — 35 commits

```
33e88d1 feat: 썸네일 TEXT 이미지 스타일 4종 + 글자 색상 선택 기능 추가
1a3efc1 feat: 썸네일 텍스트 줄바꿈 개선 / 맞춤법 프롬프트 강화 / 연관어 클러스터 추가 / nodemon 감시 파일 추가
7cd68dc fix: 썸네일 텍스트 이미지 합성 전반 수정
f6b7a6f fix: 썸네일 텍스트 미적용 및 제목 [B] 태그 문제 수정
15be627 feat: 썸네일 텍스트를 sharp로 이미지에 직접 합성
ab86d50 feat: 황금키워드 분석에 사용자 Gemini API 키 적용 및 안정성 개선
74ab15e perf: 에디터 로딩 고정 대기를 준비 완료 감지 방식으로 교체
1dee136 fix: 임시저장 팝업 취소 버튼 클릭 문제 최종 해결
6412f9d fix: 임시저장 복구 팝업 취소 버튼 클릭 신뢰성 개선
7a84bdf feat: 썸네일 텍스트 이미지 설정 지원 및 현재 날짜 기준 연도 명시
d827174 feat: 키워드 인구통계 분석 방식 개선 및 요일별 검색 비율 기간 확장
3676356 fix: 푸터 이미지 링크 적용 기능 수정
e657cc6 feat: 사용자별 Gemini API 키 우선 적용 및 푸터 이미지 URL 지원
77f1788 fix: 스마트에디터 임시저장 팝업 조기 감지 및 팝업 탐지 범위 확대
b609a33 fix: 소제목 인용구 줄바꿈 문제 및 QUOTE_VERTICAL 오용 방지
2b78765 fix: 서버 재시작 시 zombie posts 자동 초기화
7b36b7a feat: 키워드 분석 속도 최적화
6e01183 fix: 발행 지연 및 UX 개선 (진행창 즉시 표시, 좀비 브라우저, 소제목 공백, 푸터 이미지)
af43620 fix: 주제 선택 라디오 버튼 직접 조작 제거 (React controlled input 오작동 방지)
a7c0109 feat: 사용자 IP 분리 방식 2가지 구현 (크롬 확장프로그램 + 프록시 IP)
3305282 fix: 글 주제 선택 후 확인 버튼 클릭 안 되는 버그 수정
ead6722 chore: 불필요한 파일 대량 정리
1d73852 chore: debug_ 파일 삭제 및 현재 상태 스냅샷
82e6ee9 feat: 네이버 블로그 동영상 업로드 기능 전체 구현 완료
aafc546 feat: 동영상 업로드 시 제목 자동 입력 후 완료 버튼 클릭
5f5a673 fix: 동영상 추가 버튼 셀렉터 실제 DOM 기반으로 수정
3503f0e fix: 동영상 업로드 완료 버튼 자동 클릭 추가
5d58bcc fix: 발행 시 글 주제(topic) 설정 안 되는 버그 수정
108034c fix: 동영상 업로드 flow 수정 (2단계 클릭 방식으로 변경)
07c3c12 feat: 네이버 블로그 동영상 업로드 기능 구현
42885f2 feat: 이미지참조 모드 Gemini 필터링 및 SEO 카테고리 프롬프트 추가
cb82b7a fix: 카테고리 파싱 버그 수정 (WidgetListAsync 작은따옴표 처리 개선 및 메소드 통합)
0a9b2bf feat: unify image upload logic and fix preview API proxy
a1b9976 fix: 네이버 블로그 카테고리/주제 선택 버그 해결 및 클릭 신뢰도 대폭 향상
8769dd9 feat: 지도 주소 우선순위 수정 및 푸터 동기화, 하이브리드 이미지 처리 개선
f90797d feat: enhance map/banner logic, update Gemini 2.5, image analysis, and improve publish automation
eba3807 feat: Enhance hashtag styling and automated business footer image insertion
380e94d feat: 게시글 업로드 기능 완료
235f115 Initial commit: Naver blog automation project setup
```

### Frontend (blog-master-web) — 14 commits

```
256e03a feat: 푸터 설정 UI 전면 재설계 — 이미지/텍스트/지도 자유 순서 배치
bc1b31e feat: 썸네일 TEXT 스타일 선택 UI + 글자 색상 스와치 버튼 추가
75a83ce fix: 발행 시 thumbnail_text가 DB에 저장되지 않던 문제 수정
a402279 feat: 황금키워드 분석에 사용자 Gemini API 키 적용
3520b1a feat: 사이드바에 업로드 진행 상태 위젯 추가
31fd2f9 feat: 황금키워드 탭 UI 개선 - 요일별 검색 비율 추가 및 툴팁 전체 정비
9a365c2 feat: 네이버 계정 푸터 설정 - 장소 검색 및 상호명 저장 개선
1302bca feat: 사용자별 Gemini API 키 등록 및 네이버 계정 푸터 설정 기능 추가
4f62094 fix: 발행 후 원고 미리보기 및 폼 내용 유지
9c30353 feat: 원고 편집 기능 추가
4cfb02a fix: preview-stream SSE route 복원
70b3ff1 fix: 세션 만료 시 원고 생성 실패 문제 수정
e0254b2 fix: 발행 버튼 클릭 후 진행창 즉시 표시 (트리거 응답 대기 제거)
f079d7e Initial commit: Next.js frontend for Naver Blog Auto
```
