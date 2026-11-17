# Netlify + Supabase 운영 배포 가이드

## 목표 구조

- Netlify: `index.html`, `intake.html`, `assets/*` 정적 배포
- Netlify Functions: 로그인, 제출, 조회, 상태 변경, 삭제, 통계 API
- Supabase Postgres: 기관, 계정, 제출건, 문항별 응답, 감사 로그 저장

## 1. Supabase 설정

1. Supabase 프로젝트를 만든다.
2. 아래 신규 설치 SQL 표 순서대로 실행한다. 기존 DB에는 이 절차를 그대로 적용하지 않는다.
3. 신규 샘플 기관/초기 계정 seed를 만든다. 운영 DB에 실행하지 않는다. 출력 경로는 프로젝트 밖의 새 비공개 폴더로 지정한다. 공유·동기화·웹 공개 폴더는 사용하지 않는다.

```powershell
# PowerShell 예시: 부모 폴더는 미리 준비하고, 출력 폴더 자체는 존재하지 않아야 합니다.
$env:SEED_OUTPUT_DIR = "C:\private-work\new-seed"
npm run seed:institutions
```

4. 지정한 비공개 폴더의 `seed.sql`을 별도 테스트 Supabase SQL Editor에서 실행한다. 먼저 필요한 스키마·마이그레이션을 적용한다.
5. 같은 폴더의 `seed-credentials.json`에 계정별 관리자·제출용 비밀번호가 저장된다. 비밀번호는 계정별·용도별 독립 난수이며 콘솔에 출력하지 않는다. 정해진 안전한 경로로 담당자에게 전달하고 초기 비밀번호를 변경하도록 안내한다.
6. DB 반영과 안전한 전달이 끝나면 SQL과 비밀번호 파일을 즉시 삭제한다. 두 파일 모두 Git·제출 자료·공개 폴더에 넣지 않는다. Windows에서는 파일 mode만으로 접근 제한이 보장되지 않으므로 폴더 ACL도 확인한다.

기존 계정과 충돌하면 계정 생성은 건너뛰므로 새 비밀번호가 적용되지 않는다. 이 명령은 신규 샘플 환경 전용이며 기존 계정 비밀번호 변경·토큰 폐기 도구가 아니다.

seed 생성에는 공통 초기 비밀번호를 사용하지 않는다. `DEFAULT_AGENCY_PASSWORD`는 seed 입력으로 사용되지 않는다.

### 신규 설치 SQL 적용 순서

아래는 제출 소스의 의존 관계를 검토한 순서이며 실제 새 DB 설치 완료를 의미하지 않는다. SQL Editor에서 파일별로 실행 결과를 확인하고, 오류가 나면 다음 단계로 넘어가지 않는다. 적용 일시·파일 버전·성공 여부를 별도 기록한다. 객체 존재만으로 파일 전체 적용을 보장하지 않으므로 부분 적용 상태에서는 무조건 재실행하지 않는다.

| 순서 | 파일 | 목적 | 적용 여부 확인 방법 |
| --- | --- | --- | --- |
| 1 | `supabase/schema.sql` | 기본 9개 테이블, 기관 계층 검증, 제출·집계 함수, 서버 전용 권한 | 아래 테이블 점검에서 기본 테이블 9개 존재. `pg_trigger`에서 `validate_institution_hierarchy_trigger`, `prevent_invalid_institution_deactivation_trigger` 확인 |
| 2 | `supabase/account-ai.sql` | 계정별 암호화 AI 설정·연결 시도 관리 | `account_ai_settings`, `account_ai_attempts` 테이블 및 `account_ai_save`, `account_ai_take_attempt` 함수 확인 |
| 3 | `supabase/survey-management.sql` | 설문별 관리구간 집계 | `pg_proc`에서 `survey_management_distribution` 함수 확인 |
| 4 | `supabase/migrations/20260915145425_checklist_submission_targets.sql` | 양식별 제출 기관 제한·DB 검증 | `checklist_templates`의 `submission_target_mode`, `submission_target_codes`, `submission_target_revision` 컬럼과 `checklist_submission_targets_validate`, `submissions_target_guard` 트리거 확인 |
| 5 | `supabase/migrations/20260916005447_submission_list_submitted_at.sql` | 제출시각 기준 검색·총점 계산·조회 인덱스 | `pg_indexes`에서 `submissions_submitted_at_live_idx` 확인. `pg_get_functiondef`로 `admin_list_submissions`의 한국시간 제출시각 범위 조건 확인 |
| 6 | 프로젝트 밖에서 생성한 `seed.sql` | 신규 샘플 기관·최초 계정 생성 | 아래 최초 계정 확인 SQL로 중앙기관과 활성 계정 존재 확인. 비밀번호·해시 원문은 조회하지 않음 |

4번은 `ADD COLUMN`·`CREATE FUNCTION`·`CREATE TRIGGER`에 중복 방지가 없으므로 한 번만 적용한다. 5번의 함수 일부는 최신 schema.sql에도 포함되어 있지만 해당 파일은 추가 인덱스까지 포함하므로 위 순서로 적용한다. `CREATE TABLE IF NOT EXISTS`는 기존 테이블 구조를 최신 상태로 자동 갱신하지 않는다.

`supabase/institution-management-migration.sql`은 **신규 설치에서 제외**한다. 과거 기관코드·상위기관을 변경하는 기존 DB 전환용 파일이며, 최신 schema.sql에는 신규 설치에 필요한 계층·제약·트리거가 포함되어 있다. 기존 DB 전환은 백업·영향 검토와 별도 승인 작업이다.

### 최초 중앙관리자 로그인

seed는 `SAMPLECENTRAL` 중앙관리자와 `assets/institutions.js`의 샘플 하위 기관을 함께 생성한다. 중앙관리자 한 명만 만드는 명령이나 실제 기관 자동 구성 도구는 아니다. 광역기관의 시군구는 DB 제약에 맞춰 공란으로 생성한다.

1. 위 순서로 SQL과 seed를 새 테스트 DB에 적용한다. 아래 조회는 코드·역할·활성 여부만 확인한다.
2. 서버 환경변수를 준비하고 본인의 로컬 Netlify Dev 또는 별도 사이트를 연다. 운영 사이트에 접속하지 않는다.
3. `seed-credentials.json`의 `institutionCode`가 `SAMPLECENTRAL`인 항목을 비공개 환경에서 확인한다. 로그인 ID는 해당 코드, 초기 비밀번호는 그 항목의 `adminPassword`이다. `intakePassword`는 관리자 로그인 비밀번호가 아니다. 이 앱의 계정은 `agency_accounts` 기반이며 Supabase Auth 사용자 생성 절차가 아니다.
4. 중앙관리자로 로그인한 뒤 비밀번호를 즉시 변경하고 새 비밀번호로 다시 로그인한다. 사용할 하위 계정도 관리자·조사자 비밀번호를 각각 변경한다. 계정정보를 README·화면 캡처·로그·채팅에 남기지 않는다.
5. 전달 및 적용 확인 후 `seed.sql`과 `seed-credentials.json`을 삭제한다. 불필요한 샘플 기관은 하위 기관부터 비활성화하고, 실제 운영 전 기관 구성 및 접근 범위를 별도로 점검한다. 기존 계정에 재실행하면 기관 정보는 갱신될 수 있지만 계정 비밀번호는 바뀌지 않으므로 빈 신규 환경에만 사용한다.

```sql
select i.code, i.type, i.active as institution_active, a.active as account_active
from public.institutions i
left join public.agency_accounts a on a.institution_code = i.code
where i.code = 'SAMPLECENTRAL';
```

### 설치 후 읽기 전용 보안 점검 SQL

SQL Editor에서 DB 관리 권한으로 실행한다. 앱 전용 테이블 11개만 대상으로 한다. **기대 결과는 전부 `table_exists=true`, `rls_enabled=true`, `policy_count=0`, `public_role_access=false`, `server_crud=true`**이다. 정책 0개는 이 앱의 서버 전용 구조에 대한 기준이지 모든 Supabase 앱의 일반 기준은 아니다. RLS와 접근 권한은 서로 별개이다. 누락·다른 결과가 있으면 서비스를 공개하지 말고 원인을 검토한다. 실제 제출 데이터나 비밀번호는 조회하지 않는다.

```sql
with expected(name) as (values
  ('institutions'), ('agency_accounts'), ('submissions'),
  ('submission_answers'), ('audit_logs'), ('checklist_templates'),
  ('template_questions'), ('question_options'), ('ai_generation_logs'),
  ('account_ai_settings'), ('account_ai_attempts')
), objects as (
  select name, to_regclass('public.' || name) as oid from expected
)
select o.name, c.oid is not null as table_exists,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
  case when c.oid is null then null else exists (
    select 1 from (values ('anon'), ('authenticated')) r(role_name)
    where has_table_privilege(r.role_name, c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r.role_name, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
  ) end as public_role_access,
  case when c.oid is null then null else
    has_table_privilege('service_role', c.oid, 'SELECT')
    and has_table_privilege('service_role', c.oid, 'INSERT')
    and has_table_privilege('service_role', c.oid, 'UPDATE')
    and has_table_privilege('service_role', c.oid, 'DELETE')
  end as server_crud
from objects o left join pg_class c on c.oid = o.oid order by o.name;
```

`has_*_privilege`는 역할 상속 및 PUBLIC으로 부여된 유효 권한도 확인한다. PostgreSQL 17 이상에서는 위 권한 목록 외 `MAINTAIN`도 별도로 확인한다. 기존 DB의 컬럼별 권한·정책은 신규 설치 SQL이 자동 제거하지 않는다.

시퀀스 5개는 모두 존재하고 `public_role_access=false`, `server_usage=true`여야 한다.

```sql
with expected(name) as (values ('submission_answers_id_seq'), ('audit_logs_id_seq'),
  ('template_questions_id_seq'), ('question_options_id_seq'), ('ai_generation_logs_id_seq'))
select name, to_regclass('public.' || name) is not null as sequence_exists,
  has_sequence_privilege('anon', to_regclass('public.' || name), 'USAGE,SELECT,UPDATE')
  or has_sequence_privilege('authenticated', to_regclass('public.' || name), 'USAGE,SELECT,UPDATE') as public_role_access,
  has_sequence_privilege('service_role', to_regclass('public.' || name), 'USAGE') as server_usage
from expected;
```

함수 목록은 아래 11개 이름에 대해 각각 존재하는지 확인한다. 공개 역할 실행 권한은 false, 서버 실행 권한은 true여야 한다. overload가 있으면 인자 형식까지 검토한다. 조회되지 않은 이름은 설치 누락이다.

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE') as public_role_access,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'admin_home_summary', 'admin_list_submissions', 'admin_submission_stats',
  'submission_question_max_score', 'validate_institution_hierarchy',
  'prevent_invalid_institution_deactivation', 'survey_management_distribution',
  'account_ai_take_attempt', 'account_ai_save',
  'validate_checklist_submission_targets', 'enforce_checklist_submission_target')
order by p.proname;
```

**검증 한계:** 위 SQL은 제출 안내에 추가한 점검문이며 이번 작업에서 실제 DB에 실행하지 않았다. 로컬 테스트는 seed 생성·비밀번호 분리·SQL 선언을 확인할 뿐 Postgres 설치 및 실제 권한 검증을 대체하지 않는다. 별도 새 DB에서 점검 후 로그인·역할별 조회 범위·설문 생성·제출·집계·계정별 AI 연결을 확인해야 한다. 향후 새 테이블·함수 추가 시에도 권한을 명시하고 다시 점검한다. 참고: [Supabase Data API 보안 안내](https://supabase.com/docs/guides/api/securing-your-api).

## 2. Netlify 환경변수

Netlify Site settings > Environment variables에 아래 값을 등록한다.

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
NETLIFY_AUTH_SECRET=충분히 긴 랜덤 문자열
ALLOWED_ORIGIN=https://example.org
ALLOW_DEFAULT_PASSWORD_FALLBACK=N
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저에 노출하면 안 된다. 반드시 Netlify Functions 안에서만 사용한다.
`ALLOW_DEFAULT_PASSWORD_FALLBACK`은 개발 중 seed 누락 확인용으로만 `Y`를 사용할 수 있고, 운영에서는 `N`으로 둔다.

## 3. API 계약

### 인증 보완 및 운영 전 미완료 사항 (2026-11-09)

- `ALLOWED_ORIGIN` 예시의 example.org는 실제 프런트엔드 출처로 교체한다. `https://호스트` 또는 `http://localhost:포트`처럼 경로·끝 슬래시·계정정보 없이 하나의 정확한 출처만 설정한다. Functions에서 사용할 수 있는 환경변수 범위로 등록하며 netlify.toml에 비밀값을 작성하지 않는다.
- 미설정·`*`·잘못된 값은 CORS 허용 헤더를 내보내지 않는다. 동일 출처의 화면과 `/api`는 CORS 허용 헤더 없이 이용할 수 있다. 로컬에서는 Netlify Dev가 제공하는 동일 출처 URL로 접속한다. 다른 포트의 프런트엔드를 사용할 때만 해당 출처를 개발 환경의 ALLOWED_ORIGIN에 설정한다. 운영에 localhost를 허용하지 않는다. 일반 응답과 AI 스트리밍 응답에 같은 정책을 적용한다.
- CORS는 브라우저의 다른 출처 응답 읽기 정책이며 API 인증·요청 횟수 제한을 대체하지 않는다. 허용되지 않은 출처라도 직접 HTTP 요청을 막는 방화벽 기능은 아니다.
- 관리자·조사자 비밀번호 원문은 브라우저 저장소에 저장하거나 현재 비밀번호로 다시 표시하지 않는다. 시작·로그아웃 시 과거 버전의 비밀번호 저장 키만 지운다. 수정본을 실행하지 않은 다른 기기나 운영 도메인의 저장소는 원격 삭제되지 않는다.
- 신규 기관/엑셀 일괄 등록 및 비밀번호 변경은 관리자·조사자 모두 최소 8자이다. 기관마다 서로 다른 충분히 긴 난수 비밀번호를 사용한다. 기존 DB의 짧은 비밀번호는 자동 교체하지 않으며 로그인도 이번 변경에서 차단하지 않는다. 운영 담당자가 별도로 변경해야 한다. 8자 기준만으로 대입 공격에 충분히 안전하다고 볼 수 없다.
- **미완료:** 로그인 시도 횟수 제한·일시 잠금, 서버 세션/토큰 무효화, 2단계 인증. 현재 토큰은 관리자 8시간·조사자 2시간이며 비밀번호 변경·비활성화·로그아웃 시 서버에서 즉시 폐기하는 공통 체계는 없다. 로그아웃은 클라이언트 세션 삭제이다. 실제 운영 전 공유 저장소 기반 시도 제한과 서버 세션 폐기 체계를 구현·검증하고 2단계 인증 적용 범위를 결정해야 한다.
- 운영 계정 교체, 브라우저 사이트 데이터 삭제, Netlify 환경변수/플랫폼 제한 설정 및 실제 배포는 제출용 소스·문서 수정에 포함되지 않는다.

### 배포 공개 범위

- `npm run build`로 `scripts/public-files.json`에 명시된 파일만 `public/`에 복사한다. 매번 이전 산출물은 정리한다.
- Netlify publish는 반드시 `public`, functions는 `netlify/functions`로 분리한다. 저장소 루트 `.` 전체를 정적 사이트로 업로드하지 않는다.
- 수동 배포 시에도 `npm run build` 후 `netlify deploy --dir=public`로 미리보기를 확인한다. Functions는 별도로 번들링되며 `/api/*` 경로를 유지한다.
- 새 공개 자산은 검토 후 목록에 추가한다. 목록에 없는 파일은 자동 공개되지 않는다.
- 공개 오픈소스 고지는 `/assets/legal/THIRD_PARTY_NOTICES.md`, 개별 라이선스는 `/assets/vendor/`에 보존한다. 이 고지 변경 시 원본과 공개 사본을 함께 갱신한다.
- PDF 가이드 원본은 기존 제출본에 포함되지 않았다. 별도 검토 후 추가할 때 공개 목록도 갱신한다.
- 배포 전 `npm run test:submission-security`와 기존 테스트를 실행한다. 배포 후 내부 경로의 404와 정상 로그인·제출·가이드·API를 별도로 확인한다.
- 이 제출본 수정은 운영 사이트를 변경하지 않는다. 기존 노출 계정 조치, 접속 기록 조사, 과거 배포 URL 차단·삭제 및 기존 토큰 무효화는 별도 승인으로 수행한다.

Base URL은 Netlify 배포 후 `/api`이다.

| Method | Path | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/api/login` | 공개 | 어드민 로그인 |
| POST | `/api/intake/login` | 공개 | 직원 공용 링크 비밀번호 확인 |
| GET | `/api/institutions/:code` | 공개 | 기관 기본 정보 조회 |
| POST | `/api/submissions` | intake/admin token | 체크리스트 제출 |
| GET | `/api/submissions` | admin token | 권한 범위 내 제출 목록 조회 |
| GET | `/api/submissions/:id` | admin token | 권한 범위 내 제출 상세 조회 |
| PATCH | `/api/submissions/:id/complete` | admin token | 권한 범위 내 대상자ID 입력 및 확인 완료 |
| DELETE | `/api/submissions` | admin token | 권한 범위 내 제출건 일괄 삭제, soft delete |
| GET | `/api/stats` | admin token | 권한 범위 내 집계 및 통계 조회 |
| PATCH | `/api/password` | admin token | 기관 비밀번호 변경 |

인증 API 응답의 `token`을 이후 요청의 `Authorization: Bearer <token>` 헤더에 넣는다.

## 4. 운영 데이터 원칙

- 비밀번호는 PBKDF2 해시와 salt로 저장한다.
- 제출건 삭제는 실제 삭제가 아니라 `deleted_at`을 기록하는 soft delete이다.
- 제출 상태는 `확인 대기`, `확인 완료`만 사용한다.
- 대상자ID는 `H*****1234567` 형식만 허용한다.
- 제출·기관·설문 변경 등 일부 쓰기 작업을 `audit_logs`에 기록한다. 로그인·열람·내려받기·AI 설정 변경을 포괄하는 감사 기록 체계는 없으며, 모든 주요 행위가 기록된다고 가정하지 않는다.
- 수행기관 권한은 자기 기관 데이터만 조회한다.
- 광역지원기관 권한은 동일 시도 내 수행기관 데이터만 조회하며, 삭제와 확인 완료 처리는 수행할 수 없다.

### 브라우저 저장소 및 공용 PC 사용 후 정리

- 관리자 로그인 토큰·기관 정보와 조사자 인증 토큰·기관코드는 sessionStorage를 사용한다. 관리자 코드에는 완료·삭제 상태와 과거 제출 사본을 다루는 localStorage 경로가 남아 있으며, 로그아웃이 모든 과거 제출 사본을 제거하지는 않는다.
- 최신 제출본은 관리자·조사자 비밀번호 원문을 새로 저장하지 않는다. 관리자 화면 시작·로그아웃 시 알려진 과거 비밀번호 저장 키만 정리하며, 이 코드를 실행하지 않은 기기나 기존 운영 사이트의 데이터를 원격으로 지우지는 않는다. 이를 모든 브라우저 데이터의 자동 파기로 안내하지 않는다.
- 공용 PC에서는 작성 중인 내용·제출 결과를 먼저 확인하고, 로그아웃 → 브라우저 설정에서 해당 사이트 데이터 삭제 → 남은 작업 탭 닫기 순서로 정리하도록 안내한다. 다른 사이트의 데이터까지 일괄 삭제하도록 요구하지 않는다.
- sessionStorage·localStorage의 정리와 서버 DB의 파기, 내려받은 Excel 및 사본의 폐기는 별개다. 창을 닫거나 토큰이 만료되어도 localStorage가 자동 파기된다고 가정하지 않는다. 필요한 파일의 보관·폐기는 기관의 별도 규칙을 따른다.
- 이번 안내는 제출용 문서 보완이며 실제 PC의 저장소 삭제나 운영 사이트 코드 변경을 수행한 것은 아니다.

### 접속·열람·내려받기 기록과 Excel 관리

현재 애플리케이션에는 로그인 성공·실패, 제출 목록·상세 열람, Excel 내려받기 및 AI 설정 변경을 포괄하는 감사 기록 체계가 없다. 일부 쓰기 작업의 audit_logs는 사용자별 접근 이력을 대체하지 않는다.

- 도입 기관은 Netlify·Supabase 로그에서 실제로 확보되는 항목, 보관 기간, 접근 권한, 조회·내보내기·점검 가능 여부를 확인한다. 플랫폼 로그와 앱의 기관·사용자·열람 대상이 연결되는지는 별도로 검증하며, 부족한 업무 기록은 기관의 별도 절차로 관리한다. 수기 기록만으로 모든 접근 추적이 보장된다고 간주하지 않는다.
- 기록 대상·담당자·보관 기간·정기 점검 주기·이상 행위 대응·파기 기준을 기관이 확정한다. 적용되는 법적 요건의 충족 여부는 별도 검토하며 이 문서에서 보관 기간을 임의로 정하지 않는다.
- 로그나 별도 기록에 비밀번호·인증 토큰·API 키·개인정보 원문을 그대로 남기지 않는다. 필요한 식별자·행위·시각·처리 결과·건수 등 최소 항목만 검토하고, 식별자 자체의 접근 통제와 보유·파기도 관리한다.
- 제출 목록 Excel은 최대 5,000건, 상세 응답 Excel은 최대 500건을 내려받을 수 있으며 개인정보를 포함할 수 있다. 필요한 범위만 추출하고 파일 암호화·접근 제한·승인된 전달 경로·보관 기간·폐기 규칙을 정한다. 자동 암호화 기능이 제공된다고 가정하지 않는다.
- 다운로드 폴더·공유 폴더·동기화 서비스·전달받은 사본의 잔존 여부도 확인한다. 목적이 끝난 파일은 정해진 절차로 폐기하고 공용 PC에 남기지 않는다.

이번 문서 보완은 실제 로그 수집·보관 설정이나 법적 적합성 확인, 다운로드 파일 암호화를 수행한 것이 아니다.

### 개인정보 설명·동의 및 처리방침 운영 준비

현재 시스템에는 대상자 동의 확인란, 동의 여부·방식·문구 버전 저장 기능, 개인정보 처리방침 제공 화면·링크가 없다. 제출이나 '확인 완료' 처리는 동의 증빙을 의미하지 않는다.

도입 기관은 실제 수집 전에 다음 사항을 확정한다.

1. 대상자 정보·설문 응답·메모 및 현장조사자 성명·전화번호의 수집 항목·목적·보유 기간과 적법한 처리 근거를 확인한다. 불필요한 정보는 수집하지 않는다.
2. 대상자에게 수집 항목·목적·보유 기간 등을 먼저 설명하고, 필요한 동의 절차(서면 등)를 따로 운영하도록 현장조사자를 교육한다. 필요한 절차가 확인되지 않으면 입력을 중단하고 담당자에게 확인한다.
3. 동의 등 관련 기록은 별도 보관하고 담당자·접근 권한·보유 기간·파기 절차를 정한다. 현장 메모를 동의 이력 저장 기능의 대용으로 쓰거나 동의서 원문을 입력하지 않는다.
4. 개인정보 처리방침을 기관 홈페이지 등 이용자가 확인할 수 있는 곳에 게시하고 조사 시 게시 위치를 안내한다.
5. 건강 관련 응답 등 민감정보의 처리 근거와 별도 동의 필요성, 대리인 동의 요건·권한 확인은 기관의 법률 검토로 확정한다. 고령만으로 대리인 동의가 가능하다고 가정하지 않는다.

이 안내는 처리방침 자체나 적법성 확인서가 아니다. 이번 제출 문서 수정으로 실제 동의 확보·기록 보관·처리방침 게시가 이루어진 것은 아니다. 제출본의 현장 메모에는 서버 측 최대 2,000자 제한이 있으나, 길이 제한이 불필요한 개인정보·민감정보 입력을 막아 주지는 않는다.

### 외부 서비스 처리 지역·위탁·국외 이전 검토

Netlify 서버 함수와 Supabase DB를 통한 개인정보 처리·저장 위치는 서비스 구성과 계약 조건에 따라 국외일 수 있다. AI 요청문·첨부파일·집계값·참고자료는 관리자가 선택한 OpenAI·Anthropic·Google로 전송되며, 전송 내용에 따라 개인정보의 국외 이전에 해당할 수 있다. 서비스 이름이나 회사 소재지만으로 실제 처리 위치 또는 법적 성격을 확정하지 않는다.

**현재 확인 상태: 기존 운영 환경의 실제 국가·지역은 이번 작업에서 미확인.** 아래는 도입 기관이 자신의 환경에서 확인·기록할 항목이며 이미 확인된 설정값이 아니다.

| 확인 대상 | 도입 기관이 확인·기록할 내용 |
| --- | --- |
| Supabase | 프로젝트 DB 지역, 백업·로그 등 관련 데이터의 처리·저장 위치 및 계약상 처리 조건 |
| Netlify | 서버 함수의 실제 실행 지역, 로그·캐시 등 관련 처리 위치와 적용 서비스 설정·계약 조건 |
| 선택한 AI 제공자 | 실제 사용하는 API·계약·설정에 따른 처리 위치, 입력·출력의 학습 사용 여부, 보관 기간·삭제 조건 |
| 처리 관계 및 적용 요건 | 각 서비스의 위탁·재위탁 등 처리 관계, 국외 이전 해당 여부와 적용되는 법적 요건을 기관의 검토로 확정 |
| 안내 및 운영 기록 | 확인일·확인자·설정/약관 근거·변경사항을 기록하고 필요한 안내·절차·처리방침에 반영. 실제 키·토큰·비밀번호는 기록하지 않음 |

DB의 지역만 확인하고 함수·로그·백업·AI까지 같은 지역이라고 가정하지 않는다. 제공자별 조건을 일률적으로 '학습 미사용' 또는 '즉시 삭제'라고 단정하지 않으며 계정·요금제·계약·설정 변경 시 재확인한다. 확인이 끝나기 전에는 실제 개인정보로 외부 연동 검증을 진행하지 않는다. 집계값도 내용·규모에 따라 개인 식별 가능성을 검토하며, 기존 AI 요청문·첨부자료의 개인정보 입력 금지 안내를 유지한다.

이 문서는 개인정보 처리방침 자체나 국외 이전 적법성 확인서가 아니다. 이번 변경은 제출 문서만 보완했으며 운영 설정 확인·변경, 제공자 계약 검토 완료 또는 실제 국외 이전 절차 이행을 의미하지 않는다.

### 개인정보 보유 및 수동 파기 절차

이 절은 관리자 운영 안내이다. 화면의 '삭제'는 `deleted_at`만 기록하는 숨김 처리이므로 제출 원문·응답·메모 등은 DB에 남는다. 제출 생성·수정·확인 상태 변경 때 `audit_logs`의 `before_data`·`after_data`에 복사된 개인정보 사본도 남는다. 제출 원본만 실제 삭제해도 감사 기록 사본이 자동 삭제되지는 않는다. 영구 삭제 및 자동 파기 기능은 현재 제공하지 않는다.

**보유 기간: 도입 기관이 확정해야 하며 이 문서에서 일률적으로 정하지 않는다.** 조사별 보유 목적·근거, 기산일, 보유 기간, 승인자와 파기 담당자를 운영 전에 확정한다. '조사 종료 후 n년'은 작성 예시이며 승인된 보유 기간이나 무기한 보관 허용을 의미하지 않는다. 제출·응답과 감사 기록은 각각 필요한 보유 기간을 검토한다.

**수동 파기 운영 절차:** 도입 기관이 확정한 보유 기간이 지난 제출건·응답 및 감사 기록 사본에 대해, 권한 있는 담당자가 삭제 전 백업의 필요성·접근권한·폐기기한과 대상 ID·건수를 확인하고 승인을 받은 뒤 Supabase에서 직접 삭제하며, 삭제 후 잔존 여부를 확인하고 처리일·담당자·승인 근거·대상별 처리 건수·결과를 개인정보 원문 없이 기록한다.

백업을 새로 만들 경우에도 무기한 보관하지 않으며, 기존 백업·내보낸 파일의 보관 및 폐기 일정도 함께 확인한다. 과거 백업 복원으로 이미 파기한 데이터가 재생성되는 경우 다시 파기할 수 있도록 처리 기록을 관리한다. 이번 문서 보완은 보유 기간 확정, 실제 데이터 삭제 또는 파기 기능 구현을 의미하지 않는다.

### 정보주체의 삭제 요청 처리 절차

시스템에는 삭제 요청 전용 접수·처리 기능이 없으므로 도입 기관이 별도 절차를 운영한다. 다음은 운영 절차의 틀이며, 법적 처리 기한·보존 의무·제한 사유는 기관이 적용 요건을 확인해 확정한다.

1. **접수:** 접수 창구와 담당자를 처리방침 등에 안내하고, 요청 내용·접수일·처리 담당자를 기록한다. 창구와 처리 기한은 이 문서에서 임의로 지정하지 않는다.
2. **확인:** 필요한 최소 범위로 본인 또는 적법한 대리권을 확인한다. 확인을 위해 불필요한 신분증 사본·민감정보를 추가 수집하지 않는다.
3. **검토:** 요청 대상 제출건·응답·감사 기록 사본 및 백업·내보낸 파일을 식별하고, 삭제 가능 범위·보존 근거·승인 절차를 검토한다. 요청이 있다고 무조건 삭제하거나 감사 기록을 일괄 삭제하지 않는다.
4. **조치:** 승인된 범위에서 권한 있는 담당자가 위 수동 파기 절차로 처리하고 잔존 여부를 확인한다. 화면의 숨김 처리만으로 영구 삭제가 완료됐다고 판단하지 않는다. 백업·내보낸 파일의 처리 일정 및 복원 시 재파기 절차도 확인한다.
5. **안내 및 기록:** 적용 기한 내 결과 또는 처리 제한 사유·범위와 후속 문의 방법을 안내한다. 요청 식별번호·처리일·담당자·판단 근거·처리 건수 등 필요한 최소 기록을 남기고, 삭제한 개인정보 원문을 처리 기록에 다시 복사하지 않는다. 요청 처리 기록의 접근 권한·보유·파기 기준도 정한다.

이번 문서 추가는 실제 요청 접수·본인 확인·데이터 삭제·법률 검토가 완료됐다는 뜻이 아니며, 코드·DB·운영 환경을 변경하지 않는다.

## 5. 다음 작업

### 접속·열람·내려받기 감사 기록 (실사용 확대 전, 미구현)

- 로그인 성공·실패, 제출 목록·상세 열람, Excel 내보내기, AI 설정 변경의 사용자·기관·시각·대상 범위·결과 등을 필요한 최소 범위로 기록하는 기능을 설계한다. 키 교체 기록에도 실제 키 값은 저장하지 않는다.
- 서버의 내보내기 요청·데이터 제공과 브라우저의 파일 생성·저장 완료를 구분한다. 서버 요청 성공만으로 파일 저장 완료를 단정하지 않는다.
- 기록의 접근 제한·변조 방지·보관·파기·검색·정기 점검·이상 행위 확인 기능과 기록 실패 시 처리 방침을 함께 설계·검증한다. 운영 요구사항을 충족하기 전까지 구현 완료 또는 접속기록 요건 충족으로 안내하지 않는다.

### AI 첨부파일·소수 인원 집계 운영 주의 및 개발 과제

- **참고자료·설문 초안용 PDF·이미지 등 첨부파일과 요청문에는 이름·주소·연락처 등 개인정보가 없는 자료만 사용한다. 시스템은 이를 완전히 자동 검출·제거하지 못한다.** 업로드 전 직접 확인하고, 개인정보 포함 여부가 불확실하면 사용하지 않는다.
- 제출 데이터의 통계 분석용 집계와 사용자가 별도 첨부한 자료의 전송 경로를 구분한다. 참고자료 PDF와 초안용 PDF·이미지는 원본 형태로 전송될 수 있다. DOCX·HWPX의 일부 전화번호·주민번호 형태 가림은 이름·주소 등을 포함한 완전한 비식별 처리가 아니다. 전송 후 AI가 결과를 차단해도 이미 이루어진 외부 전송이 취소되는 것은 아니다.
- 5명 미만 집계 칸에서는 개인 추정 위험이 있으므로 기관·성별·연령대·점수 구간을 지나치게 세분화하지 않는다. 범위를 넓히거나 구간을 합치고 위험이 남으면 AI 분석 요청을 하지 않는다. 5명 이상도 익명성을 보장하지 않는다.
- **현재 미구현:** 서버가 AI 전송 전에 소수 인원 수치를 가리는 기능. 현재 AI 지시문은 작은 칸을 결론의 근거로 쓰지 말라고 안내할 뿐 전송 자체를 막지 않는다.
- **개발 목록:** 5명 미만 수치를 '5명 미만'으로 대체하거나 제외하는 처리와 함께 합계·비율·다른 표를 통한 역산, 반복 질의에 의한 추정 위험을 검토한다. 전송되는 전체 분석 데이터와 수치 검증·AI 해석 기능을 함께 점검해야 하며, 문서 추가만으로 구현이 완료된 것이 아니다.

### 동의 확인·처리방침 기능 (미구현)

- 조사 화면의 설명·동의 확인란과 처리방침 링크 제공 기능을 개발 목록으로 관리한다.
- 동의 여부·방식·동의 문구 버전·확인 시점 등 필요한 기록 항목과 접근 권한·보유·파기 기준을 기관의 검토를 거쳐 설계한다. 대상자 본인의 동의와 조사자의 절차 확인 기록을 혼동하지 않도록 한다.
- 화면 체크박스 하나가 적법한 동의 확보를 자동 보장하지 않는다. 동의가 아닌 별도 처리 근거가 적용되는 경우와 거부·철회 대응도 함께 검토한다.
- 현재는 화면·API·DB 변경을 구현하지 않았으며, 실제 기관의 운영 절차는 별도로 준비해야 한다.

### Node.js 버전 및 운영 반영 확인

- Node.js 20은 공식 지원 일정상 2026-04-30에 지원이 종료되었다. 제출본은 Node 24 계열 최신 보안 패치를 권장하며 최소 24.22.1, 22 계열은 최소 22.23.4를 요구한다. package.json과 package-lock.json의 요구사항은 `>=22.23.4 <23 || >=24.22.1 <25`이다. 이는 요구사항 선언이며 설치 도구 설정에 따라 경고에 그칠 수 있으므로 실제 `node --version`도 확인한다.
- netlify.toml의 `[build.environment] NODE_VERSION = "24"`는 빌드용 메이저 버전 지정이다. 빌드 로그에서 정확한 패치 버전이 최소 기준 이상인지 확인한다. 이 설정만으로 이미 배포된 함수가 갱신되는 것은 아니다.
- 실제 Netlify Functions 런타임은 별도로 확인한다. 기존 런타임 재정의 설정이 있다면 함께 검토한다. `AWS_LAMBDA_JS_RUNTIME` 같은 런타임 설정은 netlify.toml이 아니라 Netlify UI/CLI/API에서 관리해야 한다. 플랫폼이 제공하는 실제 패치와 지원 현황을 확인하고, 런타임 버전만 제한적으로 기록하여 검증한다. 환경변수 전체나 비밀값은 로그에 출력하지 않는다.
- 운영 반영은 별도 승인 작업이다. 이전 배포 식별자와 복구 절차를 보존하고 재배포 후 로그인·기관 권한·제출·집계·통계·AI 연결을 검증한다. 이번 제출 파일 수정은 운영 설정 변경·배포·DB 검증을 포함하지 않는다.
- 공식 지원 일정: https://github.com/nodejs/Release/blob/main/schedule.json ; 배포 목록: https://nodejs.org/dist/index.json ; 보안 공지: https://nodejs.org/en/blog/vulnerability . 최소 패치 번호를 영구적인 안전 기준으로 간주하지 말고 후속 보안 릴리스마다 재확인한다. Node 22 환경의 별도 실행 검증은 이번 작업에 포함하지 않는다.

### 보안 헤더·오류 처리 개발 과제

- **제출 설정 반영:** netlify.toml의 `/*` 정적 응답 헤더에 `Permissions-Policy: camera=(), microphone=(), geolocation=()`를 추가했다. 앱 코드에서 해당 브라우저 API 사용을 찾지 못한 세 기능만 제한했다. 클립보드 복사·전체화면 등 다른 기능은 이번 정책으로 추가 제한하지 않는다. 이 정책은 XSS 방어를 대신하지 않는다.
- Netlify 설정 가이드상 `[[headers]]`는 정적 응답용이며 Functions 응답에 자동 적용되지 않는다. 이번 작업은 API 응답 코드 변경을 포함하지 않는다. 실제 배포 후 `/admin`, `/landing`, `/intake.html`의 응답 헤더와 정상 사용 흐름을 별도로 확인해야 한다. 현재 운영 사이트에는 적용하지 않았다.
- **CSP 미구현:** index.html의 인라인 스크립트를 외부 파일로 옮기고 공개 파일 허용 목록에 추가하는 작업, 인라인 스타일·이벤트·외부 이미지/폰트·PDF worker 등의 의존성 점검, 로그인·설문 제출·파일 업로드·Excel/PDF 기능 회귀 검증을 개발 목록으로 남긴다. 필요 시 보고 전용 정책으로 영향을 확인한 뒤 차단 정책으로 전환한다. 보고 전용 정책은 공격을 차단하지 않는다. 이번 제출 수정에서 인라인 스크립트 이동이나 CSP 헤더 추가는 하지 않았다.
- **오류 문구 일반화 미구현:** 예상하지 못한 서버 오류, DB 오류 원문과 환경 설정 정보가 사용자에게 그대로 전달되지 않도록 일반 안내와 요청 식별자로 대체하는 작업을 개발 목록으로 남긴다. 정상적인 입력 오류 안내는 유지하고, 서버 로그에도 비밀번호·토큰·개인정보 원문을 기록하지 않도록 설계해야 한다. 환경변수 이름 노출과 실제 키 값 유출은 구분한다.
- **DB 호출 시간 제한 미구현:** 일반 조회와 건수 조회를 포함한 DB 호출에 명시적 제한을 추가하고 시간 초과 안내·요청 취소·분할 집계의 전체 처리 시간을 검증하는 작업을 개발 목록으로 남긴다. 8초는 검토 예시이며 고정 적용값으로 확정하지 않았다. 시간 초과가 DB 저장 취소를 보장하지 않으므로 제출·변경 요청을 자동 재시도하지 말고, 저장 결과 확인과 중복 방지 방안을 함께 설계해야 한다.

- `assets/app.js`의 localStorage 기반 관리자 로직을 `/api/*` 호출로 교체
- `assets/intake.js`의 제출 저장 로직을 `/api/submissions` 호출로 교체
- Netlify Dev에서 로그인, 제출, 목록, 상세, 확인 완료, 통계 순서로 통합 테스트
