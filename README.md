# 건강기록

식단·운동·복약·수면·신체수치·건강검진 결과를 한 곳에서 관리하는 개인 건강 기록 플랫폼.

기획서: [`docs/PLAN.md`](docs/PLAN.md)

---

## 현재 상태 — Phase 2 완료

| Phase | 내용 | 상태 |
|---|---|---|
| Phase 0 | 프로젝트 셋업 · 인증 · 동의 · 스키마 · RLS · 앱 셸 | ✅ 완료 |
| Phase 1 | 신체기록 · 수면 · 복약 · 복약 알림 | ✅ 완료 |
| **Phase 2** | 식단 · 운동 | ✅ 완료 |
| Phase 3 | 검진 결과지 자동 판독 | 예정 |
| Phase 4 | 대시보드 · 주간 리포트 | 예정 |
| Phase 5 | PWA · 접근성 · 약관 · 탈퇴 절차 | 예정 |

---

## 기술 스택

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Supabase** — Postgres + Auth + Storage, RLS로 사용자 격리
- **Claude API** (`claude-opus-5`) — 검진 결과지 판독 (Phase 3)

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
npm run check   # 타입 검사 + 린트 + 테스트
npm run build   # 프로덕션 빌드
```

테스트는 Node 내장 러너를 사용합니다(별도 의존성 없음). 지표 판정
로직(`src/lib/metrics/status.ts`)의 경계값, 수면 시간 계산(자정 통과), 음식 API
응답 파싱을 고정하고 있습니다. 특히 정상/주의/범위밖 판정이 조용히 바뀌면
사용자에게 잘못된 신호를 주기 때문에 경계값을 명시적으로 박아 두었습니다.

---

## 프로젝트 구조

```
src/
  app/
    (auth)/          로그인 · 가입
    onboarding/      동의 · 프로필 설정
    (dashboard)/     오늘 · 기록 · 식단 · 운동 · 복약 · 검진 · 리포트 · 설정
    auth/callback/   이메일 인증 · OAuth 리디렉션
  components/        공용 UI
  lib/
    supabase/        클라이언트(브라우저/서버) + 세션 갱신
    db/types.ts      DB 타입
    metrics/         지표 상태 판정 · 참고범위
    food/            음식 검색 (로컬 캐시 우선) · 공공 API 클라이언트
    sleep/           수면 시간 계산
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
