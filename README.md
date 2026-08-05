# 건강기록

식단·운동·복약·수면·신체수치·건강검진 결과를 한 곳에서 관리하는 개인 건강 기록 플랫폼.

기획서: [`docs/PLAN.md`](docs/PLAN.md)

---

## 현재 상태 — Phase 0~5 완료

| Phase | 내용 | 상태 |
|---|---|---|
| Phase 0 | 프로젝트 셋업 · 인증 · 동의 · 스키마 · RLS · 앱 셸 | ✅ 완료 |
| Phase 1 | 신체기록 · 수면 · 복약 · 복약 알림 | ✅ 완료 |
| Phase 2 | 식단 · 운동 | ✅ 완료 |
| Phase 3 | 검진 결과지 자동 판독 · 검수 UI | ✅ 완료 |
| Phase 4 | 대시보드 · 주간 리포트 · 통합 그래프 | ✅ 완료 |
| Phase 5 | PWA · 접근성 · 약관 · 탈퇴 절차 | ✅ 완료 |

기능 구현은 끝났지만 **이대로 서비스를 열 수는 없습니다.** 약관 다섯 건이
아직 법률 검토 전이고, 배치 등록과 환경변수가 남아 있습니다 —
[`docs/RELEASE.md`](docs/RELEASE.md) 를 먼저 읽어 주세요.

---

## 기술 스택

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Supabase** — Postgres + Auth + Storage, RLS로 사용자 격리
- **Claude API** (`claude-opus-5`) — 검진 결과지 판독 (Structured Outputs)

---

## 로컬 실행

### 1. Supabase 프로젝트 준비

[supabase.com](https://supabase.com) 에서 프로젝트를 만든 뒤, 마이그레이션을 적용합니다.

```bash
# Supabase CLI 설치 후
supabase link --project-ref <your-project-ref>
npm run db:push
```

`supabase/migrations/` 의 파일이 번호 순으로 적용됩니다.

### 2. 환경변수

```bash
cp .env.example .env.local
```

`.env.local` 에 Supabase URL 과 publishable(anon) key 를 채웁니다.
프로젝트 설정 → **Data API** 에서 확인할 수 있습니다.

### 3. 실행

```bash
npm install
npm run dev
```

<http://localhost:3000>

### 4. 검증

```bash
npm run check   # 타입 검사 + 린트 + 테스트 + 명도대비
npm run build   # 프로덕션 빌드
```

`typecheck` 는 `tsc` 앞에 `next typegen` 을 먼저 돌립니다. `PageProps` ·
`LayoutProps` 는 Next 가 라우트 구조에서 생성하는 전역 타입이라, 빌드 산출물이
없는 상태에서 `tsc` 만 돌리면 "Cannot find name 'PageProps'" 로 실패합니다.

**Node 22.18 이상이 필요합니다.** 그 아래에서는 타입 스트리핑이 플래그 뒤에
있어 `node --test` 가 `.ts` 파일을 실행하지 못하고, 테스트가 실패가 아니라
"0개 통과"로 조용히 넘어갑니다.

테스트는 Node 내장 러너를 사용합니다(별도 의존성 없음). 조용히 틀릴 수 있는
곳만 고정합니다.

| 대상 | 무엇을 막는가 |
|---|---|
| `lib/metrics/status.ts` | 정상/주의/범위밖 경계값. 바뀌면 사용자에게 잘못된 신호가 간다 |
| `lib/sleep/window.ts` | 자정을 넘는 수면 시간 계산 |
| `lib/food/mfds.ts` | 공공 API 응답 필드 별칭 · 이중 인코딩된 인증키 |
| `lib/checkup/normalize.ts` | 목록에 없는 지표 코드, 값 없는 행 |
| `lib/reports/format.ts` | 비교 대상이 없을 때 델타를 0 으로 취급하지 않는 것 |
| `lib/supabase/paths.ts` | 접두사가 겹치는 경로로 인증·동의 게이트가 뚫리는 것 |

`npm run a11y:contrast` 는 `globals.css` 의 토큰을 직접 읽어 WCAG AA 대비를
계산합니다. 4.5:1 은 눈으로 판별되는 경계가 아니라서 자동으로 확인합니다.
`npm run check` 에 포함되어 있습니다.

CI(`.github/workflows/ci.yml`)는 위 검사에 더해 임시 Postgres 에 마이그레이션
전체를 적용해 봅니다. 스키마는 타입 검사가 잡아 주지 않아, 문법 오류가
배포 시점까지 살아남습니다.

---

## 프로젝트 구조

```
src/
  app/
    (auth)/          로그인 · 가입
    onboarding/      동의 · 프로필 설정
    (dashboard)/     오늘 · 기록 · 식단 · 운동 · 복약 · 검진 · 리포트 · 설정
    legal/           이용약관 · 개인정보 처리방침 (로그인 불필요)
    offline/         오프라인 안내 (서비스 워커가 미리 받아 둠)
    api/             검진 판독 · 푸시 발송 · Storage 정리
    auth/callback/   이메일 인증 · OAuth 리디렉션
    manifest.ts      PWA 매니페스트
  components/        공용 UI
  lib/
    supabase/        클라이언트(브라우저/서버) · 세션 갱신 · 경로 규칙
    db/types.ts      DB 타입
    metrics/         지표 상태 판정 · 참고범위
    food/            음식 검색 (로컬 캐시 우선) · 공공 API 클라이언트
    sleep/           수면 시간 계산
    checkup/         결과지 판독 스키마 · 프롬프트 · 정규화
    reports/         주간 리포트 계산
    legal/           약관 문서 조회
    push/            웹 푸시 VAPID 설정
    nav.ts           내비게이션 정의
  proxy.ts           세션 갱신 + 접근 제어 + 동의 게이트
                     (Next 16 규약. 15 이전의 middleware.ts 에 해당)

supabase/migrations/
  0001_initial_schema.sql           전체 스키마
  0002_rls_policies.sql             RLS 정책 + Storage 버킷
  0003_seed_metric_definitions.sql  지표 마스터 + 정상범위
  0004_consent_functions.sql        동의 판정 함수 + 동의 문서 v1
  0005_phase1_records.sql           파생 지표 트리거 · 복약 스케줄 전개 · 푸시 구독
  0006_medication_reminders.sql     알림 발송 대상 조회 (스케줄러 전용)
  0007_phase2_diet_exercise.sql     영양·운동 집계 트리거 · 운동 마스터 · 음식 캐시
  0008_phase3_checkup_review.sql    검진 확정·되돌리기 · Storage 정리 큐
  0009_phase4_reports.sql           주간 집계 · 기간별 지표 변화
```

음식 API 키 발급과 연결 확인은 [`docs/FOOD_API.md`](docs/FOOD_API.md) 참고.
키가 없어도 직접 입력으로 식단 기록은 정상 동작합니다.

## 복약 알림 설정

알림은 선택 기능입니다. 아래를 설정하지 않아도 나머지는 모두 동작하며,
알림 토글만 "설정되지 않음"으로 표시됩니다.

1. VAPID 키 쌍 생성 후 `.env.local` 에 입력

   ```bash
   npx web-push generate-vapid-keys
   ```

2. `CRON_SECRET` 을 임의의 긴 문자열로 설정
3. Supabase SQL Editor 에서 pg_cron 작업 등록 —
   `supabase/migrations/0006_medication_reminders.sql` 하단의 주석 참고

발송 경로는 `pg_cron` → `POST /api/push/dispatch` → `web-push` 입니다.
`/api/push/dispatch` 는 `CRON_SECRET` 이 없으면 503 으로 닫혀 있으므로,
설정하지 않은 상태에서 외부에 노출되어도 아무 동작도 하지 않습니다.

---

## 설계에서 알아둘 것

### 통합 지표 체계

모든 수치형 건강 데이터는 `health_metrics` **단일 테이블**에 들어갑니다.
자가측정과 검진 결과를 별도 테이블로 나누면 "혈당 추세" 같은 화면에서
매번 조인·정규화를 해야 하고, 지표가 늘 때마다 스키마가 바뀝니다.

```sql
health_metrics (metric_code, value, unit, measured_at, source)
                                                      ↑
                            self | checkup | device | derived
```

**새 지표 추가는 `metric_definitions` 에 행을 하나 넣는 것으로 끝납니다.**
스키마 변경이 필요 없습니다.

식단·운동·수면의 집계값(섭취 칼로리, 수면 시간 등)도 `source='derived'` 로
같은 테이블에 기록합니다. 그래야 "수면 시간 vs 체중" 같은 교차 분석이
같은 쿼리 경로로 나옵니다.

### 새 테이블을 추가할 때

사용자 데이터 테이블이라면 **반드시** 두 가지를 함께 넣으세요.

1. `user_id uuid not null references auth.users (id) on delete cascade`
2. RLS 정책 4종 (`0002_rls_policies.sql` 의 `owned_tables` 배열에 추가)

RLS 를 켜고 정책을 잊으면 데이터가 새는 게 아니라 접근이 막히므로,
빠뜨렸을 때 조용히 유출되지는 않습니다. 그래도 습관으로 함께 넣으세요.

### 의료법 · 개인정보보호법

- 지표 상태 라벨은 **정상 / 주의 / 범위 밖 / 판정 기준 없음** 네 가지뿐입니다.
  질병명이나 진단성 표현("당뇨 의심" 등)을 추가하지 마세요.
  이 경계는 `src/lib/metrics/status.ts` 한 곳에서 강제됩니다.
- 건강정보는 민감정보이므로 **별도 동의** 없이는 어떤 건강 데이터도
  수집·표시하지 않습니다. proxy 의 동의 게이트가 이 경계입니다.
- 검진 결과지 자동 판독은 **자동 저장하지 않습니다.** 추출 결과는
  `checkup_extractions` 에 원본으로 보존되고, 사용자가 원본과 대조해
  확정한 항목만 `health_metrics` 로 넘어갑니다.

### 동의 문서

`supabase/migrations/0004_consent_functions.sql` 의 동의 문안은 **개발용 초안**입니다.
서비스 오픈 전 법률 검토를 거쳐 정식 문안으로 교체하고 `version` 을 올려야 합니다.
버전을 올리면 기존 동의가 자동으로 무효가 되어 재동의 화면이 뜹니다.

### 서비스 워커 캐시

`public/sw.js` 가 캐시하는 것은 **오프라인 안내 페이지와 `/_next/static` 뿐**입니다.
화면 HTML, RSC 페이로드, API 응답은 절대 넣지 마세요. 거기에는 복약 이력과
검진 수치가 실려 있고, 서비스 워커 캐시는 오리진 단위로 디스크에 남아
로그아웃한 뒤에도 지워지지 않습니다.

오프라인 임시 저장(나중에 동기화)도 의도적으로 넣지 않았습니다. 복약 체크가
서버에 닿지 않았는데 "저장됨"으로 보이면, 사용자는 먹었다고 믿고 다시 먹지
않습니다.

### 탈퇴

`auth.users` 행 하나가 지워지면 `public` 스키마의 모든 사용자 데이터가
cascade 로 함께 사라집니다. **새 테이블을 만들 때 `on delete cascade` 를
빠뜨리면 그 테이블만 탈퇴 후에도 남습니다.**

Storage 객체는 cascade 대상이 아닙니다. `checkup_documents` 삭제 트리거가
`storage_cleanup_queue` 에 경로를 남기고, `POST /api/storage/cleanup` 배치가
실제 파일을 지웁니다. **이 배치를 등록하지 않으면 파기했다고 표시된 파일이
실제로는 남습니다.**
