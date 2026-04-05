# EHSC Connect — 이현중학교 학생자치회 웹사이트

이현중학교 학생자치회(EHSC Connect)의 공식 웹사이트입니다.
Notion CMS 기반, Cloudflare Pages + Cloudflare Workers로 운영됩니다.

---

## 개발 환경 시작

```bash
npm install
npm run dev       # http://localhost:3000
```

빌드 및 프리뷰:

```bash
npm run build     # vite build → dist/
npm run preview   # dist/ 로컬 프리뷰
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19 + TypeScript + Tailwind CSS v4 |
| 번들러 | Vite 6 |
| CMS | Notion |
| API 프록시 | Cloudflare Workers (`workers/notion-proxy.ts`) |
| 호스팅 | Cloudflare Pages |

---

## 통합검색 구조

검색은 **재배포 없이 Notion 글 변경이 반영**되는 실시간 구조입니다.

```
Notion CMS
    ↓
Cloudflare Worker  →  GET /search-index  (캐시 TTL: 120초)
    ↓
브라우저 메모리  (5분 캐시)
    ↓
검색어 입력 → 브라우저 로컬 필터링 → 결과 즉시 표시
```

### 검색 흐름 (사용자 관점)

1. 헤더 검색 아이콘 클릭 또는 `Ctrl+K`
2. 검색창 열림 → `/search-index` 1회 호출 (첫 열림 시만)
3. 검색어 입력 → 브라우저에서 즉시 필터링 (서버 추가 요청 없음)
4. 결과 클릭 → 해당 페이지로 이동

### 검색 대상

- 공지사항
- 학생회 행사 / 스포츠라이트 / 체육대회·이현제
- 회의록 / 기타자료실
- EHBS 방송부
- 자율동아리 소개
- 동아리 활동 게시글

### 캐시 & 반영 시간

| 구간 | TTL | 설명 |
|------|-----|------|
| Worker 엣지 캐시 | 120초 | Cloudflare CDN |
| 브라우저 메모리 캐시 | 5분 | 같은 탭 내 재열림 시 재사용 |

**Notion에 글 추가/수정/삭제 후 최대 2분 내 검색 결과에 반영됩니다.**

### 즉시 반영이 필요한 경우 (캐시 Purge)

```bash
# PURGE_SECRET 은 wrangler secret put PURGE_SECRET 으로 설정
curl -X POST https://<worker-url>/purge \
  -H "X-Purge-Secret: <PURGE_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://<worker-url>/search-index"]}'
```

---

## Worker 엔드포인트 목록

| 메서드 | 경로 | 설명 | 캐시 TTL |
|--------|------|------|----------|
| GET | `/search-index` | 통합검색 인덱스 (전체 콘텐츠 배열) | 120초 |
| GET | `/home-data` | 홈 화면 4개 섹션 통합 데이터 | 60초 |
| GET | `/posts` | 게시글 목록 | 120초 |
| GET | `/posts/:id` | 게시글 상세 | 300초 |
| GET | `/clubs` | 자율동아리 목록 | 120초 |
| GET | `/clubs/by-slug/:slug` | 동아리 상세 (slug 기반) | 300초 |
| GET | `/club-posts` | 동아리 활동 게시글 목록 | 120초 |
| GET | `/club-posts/:id` | 동아리 활동 상세 | 300초 |
| GET | `/image?url=...` | Notion S3 이미지 프록시 | 없음 |
| POST | `/purge` | 캐시 수동 삭제 | — |

---

## Worker 환경 변수 설정

```bash
wrangler secret put NOTION_API_KEY              # Notion Integration Token
wrangler secret put NOTION_DATABASE_ID          # 메인 학생자치회 DB ID
wrangler secret put NOTION_EHBS_DATABASE_ID     # EHBS 전용 DB (선택)
wrangler secret put NOTION_CLUBS_DATABASE_ID    # 자율동아리 DB (선택)
wrangler secret put NOTION_CLUB_POSTS_DATABASE_ID # 동아리 활동 DB (선택)
wrangler secret put PURGE_SECRET               # 캐시 Purge 인증키 (선택)
```

Worker URL 변경 시 `src/lib/config.ts`의 `WORKER_BASE_URL`을 수정하세요.

---

## 후대 학생자치회를 위한 운영 안내

### 새 글 추가 후 검색 반영

```
Notion에 글 작성 (공개 Select 값 설정)
    ↓
자동으로 반영됨 (최대 2분 대기)
    ↓
필요 시 /purge 로 즉시 반영
```

**재배포는 필요하지 않습니다.**

### Notion DB 속성 규칙

**메인 DB** (공지사항/행사/자료실):
- `공개` (Select): `예정` / `진행중` / `완료` 중 하나를 선택해야 검색에 노출됩니다.
- `카테고리` (Select): `공지사항` / `학생회 행사` / `스포츠라이트` / `체육대회/이현제` / `회의록` / `기타자료실` / `EHBS`

**자율동아리 DB**:
- `게시여부` (Checkbox): 체크해야 검색에 노출됩니다.

**동아리 활동 DB**:
- `공개여부` (Checkbox): 체크해야 검색에 노출됩니다.

### Worker URL 변경 시

`src/lib/config.ts` 파일에서 `WORKER_BASE_URL` 상수 하나만 수정하면 됩니다.

---

## 파일 구조 (주요)

```
├── src/
│   ├── App.tsx                    # 루트 컴포넌트 & SPA 라우터
│   ├── components/
│   │   ├── Components.tsx         # Header, Footer 등 공통 컴포넌트
│   │   ├── Pages.tsx              # 각 페이지 컴포넌트
│   │   └── SearchModal.tsx        # 통합검색 모달 UI
│   ├── hooks/useNotion.ts         # Notion API React 훅
│   ├── lib/
│   │   ├── api.ts                 # Worker API 클라이언트 함수
│   │   └── config.ts              # Worker URL, 카테고리 상수
│   └── types/notion.ts            # TypeScript 타입 정의
├── workers/
│   └── notion-proxy.ts            # Cloudflare Worker (Notion API 프록시)
├── vite.config.ts
└── package.json
```
