# Google Apps Script 배포 파일

> **화면 시연 전용 — 실제 운영 금지**  
> 이 폴더는 예선 단계의 Google Apps Script 화면 프로토타입입니다. 서버 기반 인증과 운영 데이터 저장 기능이 없습니다. 로그인은 브라우저 내부 비교 방식이며, 입력 내용과 비밀번호가 브라우저 저장소에 남을 수 있습니다. 실제 개인정보·비밀번호를 입력하거나 업무 운영에 사용하지 마세요. 가상 데이터로만 시연하세요.

이 폴더는 생활안전점검 수행기관 어드민 프로토타입을 Google Apps Script 웹앱으로 배포하기 위한 파일입니다.

## Apps Script에 올릴 파일

- `Code.gs`
- `index.html`
- `styles.html`
- `app.html`
- `institutions.html`
- `intake.html`
- `intake-app.html`

## 로고 적용 안내

현재 `index.html`은 로컬 프로토타입과 같은 경로인 `assets/ai-safety-check-logo.svg`를 참조합니다. Apps Script 웹앱 배포 시에는 로컬 PNG 파일이 자동 배포되지 않으므로, 해당 이미지를 Google Drive 또는 공개 가능한 이미지 저장소에 올린 뒤 `gas/index.html`의 `brand-logo` 이미지 `src`를 공개 URL로 교체해야 합니다.

## 가상 데이터 화면 시연을 위한 수동 업로드 순서

1. [Google Apps Script](https://script.google.com/)에서 새 프로젝트를 만듭니다.
2. 기본 `Code.gs` 내용을 이 폴더의 `Code.gs`로 교체합니다.
3. HTML 파일을 추가합니다.
   - 파일명 `index`, 내용은 `index.html`
   - 파일명 `styles`, 내용은 `styles.html`
   - 파일명 `app`, 내용은 `app.html`
   - 파일명 `institutions`, 내용은 `institutions.html`
   - 파일명 `intake`, 내용은 `intake.html`
   - 파일명 `intake-app`, 내용은 `intake-app.html`
4. 상단의 `배포` > `새 배포`를 선택합니다.
5. 유형은 `웹 앱`을 선택합니다.
6. 실행 권한은 본인 계정, 접근 권한은 테스트 목적이면 본인 또는 조직 사용자로 설정합니다.
7. 배포 후 발급된 웹앱 URL로 접속합니다.
   - 어드민: 웹앱 URL
   - 직원용 제출 화면: 웹앱 URL 뒤에 `?page=intake&agency=SAMPLEAG001` 추가

## 현재 상태

현재 버전은 화면 프로토타입입니다. 제출용 가상 수행기관 6개와 가상 광역지원기관 2개 마스터가 반영되어 있습니다. 로그인 ID는 가상 기관코드이며, 예시 ID는 `SAMPLEAG001`, 초기 패스워드는 기관 비밀번호 `REMOVED_DEFAULT_PASSWORD`입니다. SRS PNG 기준 실제 문항과 점수체계가 반영되어 있으며, 직원용 제출 화면은 `?page=intake&agency=SAMPLEAG001`처럼 기관코드를 붙여 접속합니다. 처리상태는 `확인 대기`, `확인 완료` 두 가지로 관리합니다. 제출 조사지 대시보드는 조사일자 시작/종료 범위 필터, 체크박스 선택 일괄 삭제, 20개 단위 페이징을 지원합니다. 확인 대기 건은 상세에서 대상자ID를 입력해 확인 완료 처리할 수 있고, 수행기관 기준 집계 및 통계 화면에서 체크리스트별 조사건수와 평균점수를 확인할 수 있습니다. Apps Script의 `PropertiesService` 또는 Google Sheets 저장 연동만 추가해서 실제 운영에 사용해서는 안 됩니다. 서버 기반 인증·권한 검증·개인정보 보호 등 별도의 보안 설계와 검증이 필요합니다.
