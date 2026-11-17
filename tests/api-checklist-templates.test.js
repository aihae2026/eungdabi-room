const {accountResponse,settingsRow}=require('./support/account-ai-fixture');
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NETLIFY_AUTH_SECRET = "test-auth-secret";
process.env.OPENAI_BASE_URL = "https://ai-gateway.example.test";
process.env.OPENAI_API_KEY = "test-ai-key";
process.env.AI_CHECKLIST_MODEL = "gpt-5.4-mini";

const { handler } = require("../netlify/functions/api-legacy.cjs");

test("홈 집계 조회 후 홈과 제출 목록 요약을 함께 갱신한다", () => {
  const source = fs.readFileSync(require.resolve("../assets/app.js"), "utf8");
  const refreshHomeData = source.match(/async function refreshHomeData\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(refreshHomeData, /await loadHomeSummary\(\)/);
  assert.match(refreshHomeData, /renderHome\(\)/);
  assert.match(refreshHomeData, /renderSummary\(\)/);
});

test("제출 페이지는 URL 기관코드를 DB에서 조회하고 기본 기관으로 대체하지 않는다", () => {
  const source = fs.readFileSync(require.resolve("../assets/intake.js"), "utf8");
  const requestAgencyCode = source.match(/function requestAgencyCode\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const initializeIntakeAgency = source.match(/async function initializeIntakeAgency\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.doesNotMatch(requestAgencyCode, /DEFAULT_INTAKE_AGENCY_CODE/);
  assert.match(initializeIntakeAgency, /apiRequest\(`\/institutions\/\$\{encodeURIComponent\(code\)\}`\)/);
  assert.match(initializeIntakeAgency, /payload\.agency\.code !== code/);
  assert.doesNotMatch(initializeIntakeAgency, /DEFAULT_INTAKE_AGENCY_CODE/);
});

function token(payload) {
  const encoded = Buffer.from(
    JSON.stringify({
      scope: "admin",
      agencyCode: "CENTRAL_TEST",
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.NETLIFY_AUTH_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function event(method, path, authToken, body) {
  return {
    httpMethod: method,
    rawUrl: `http://localhost/api${path}`,
    headers: { authorization: `Bearer ${authToken}` },
    body: body === undefined ? null : JSON.stringify(body),
  };
}

test("기관코드는 영문과 숫자만 허용한다", async () => {
  global.fetch = async () => {
    throw new Error("기관코드 형식 검사 전에 Supabase를 호출하면 안 됩니다.");
  };
  const result = await handler(event("POST", "/institutions", token({ role: "central", agencyCode: "SAMPLECENTRAL" }), {
    code: "SAMPLE-AG-010",
    type: "agency",
  }));
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /영문과 숫자/);
});

test("광역지원기관은 광역지원기관을 추가할 수 없다", async () => {
  global.fetch = async () => {
    throw new Error("권한 검사 전에 Supabase를 호출하면 안 됩니다.");
  };
  const result = await handler(event("POST", "/institutions", token({ role: "regional", agencyCode: "SAMPLEREG01" }), {
    code: "SAMPLEREG03",
    type: "regional",
  }));
  assert.equal(result.statusCode, 403);
  assert.match(JSON.parse(result.body).message, /기관담당자만/);
});

test("광역지원기관의 기관 목록은 부모코드로 범위를 제한한다", async () => {
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("GET", "/institutions", token({ role: "regional", agencyCode: "SAMPLEREG01" })));
  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /parent_code\.eq\.SAMPLEREG01/);
  assert.doesNotMatch(requestedUrl, /sido=eq/);
});

test("중앙기관이 수행기관과 초기 비밀번호 계정을 함께 등록한다", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.includes("institutions?code=eq.SAMPLEAG010")) return { ok: true, status: 200, text: async () => "[]" };
    if (requestUrl.includes("institutions?code=eq.SAMPLEREG01")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ code: "SAMPLEREG01", type: "regional", sido: "부모광역시", active: true }]) };
    }
    if (requestUrl.endsWith("/rest/v1/institutions") && options.method === "POST") {
      return { ok: true, status: 201, text: async () => JSON.stringify([options.body ? JSON.parse(options.body) : {}]) };
    }
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("POST", "/institutions", token({ role: "central", agencyCode: "SAMPLECENTRAL" }), {
    code: "sampleag010",
    type: "agency",
    parentCode: "SAMPLEREG01",
    sido: "가상특별시",
    sigungu: "가상구 D",
    name: "가상 수행기관 010",
    adminPassword: "admin1234",
    intakePassword: "intake1234",
  }));
  assert.equal(result.statusCode, 201);
  const institutionInsert = requests.find((item) => item.url.endsWith("/rest/v1/institutions") && item.method === "POST");
  const accountInsert = requests.find((item) => item.url.endsWith("/rest/v1/agency_accounts") && item.method === "POST");
  assert.equal(institutionInsert.body.code, "SAMPLEAG010");
  assert.equal(institutionInsert.body.parent_code, "SAMPLEREG01");
  assert.equal(institutionInsert.body.sido, "부모광역시");
  assert.equal(accountInsert.body.institution_code, "SAMPLEAG010");
  assert.notEqual(accountInsert.body.password_hash, "admin1234");
  assert.notEqual(accountInsert.body.intake_password_hash, "intake1234");
});

test("하위 기관 수정은 중앙·광역 모두 시도와 소속 변경을 무시한다", async () => {
  for (const role of ['central', 'regional']) {
    const writes = [];
    global.fetch = async (url, options = {}) => {
      const row = {code:'CHILD01',type:'agency',name:'기존',sido:'기존시도',sigungu:'기존구',parent_code:'REGION01',active:true};
      if (options.method === 'PATCH') writes.push(JSON.parse(options.body));
      return {ok:true,status:200,text:async()=>JSON.stringify([row])};
    };
    const result = await handler(event('PATCH','/institutions/CHILD01',token({role,agencyCode:'REGION01'}),{name:'수정',sido:'조작시도',sigungu:'수정구',parentCode:'OTHER'}));
    assert.equal(result.statusCode,200);
    assert.equal(writes[0].sido,undefined);
    assert.equal(writes[0].parent_code,undefined);
    assert.equal(writes[0].sigungu,'수정구');
  }
});

test("광역지원기관은 본인 기관명만 수정할 수 있다", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if ((options.method || "GET") === "PATCH") return { ok: true, status: 200, text: async () => JSON.stringify([options.body ? JSON.parse(options.body) : {}]) };
    return { ok: true, status: 200, text: async () => JSON.stringify([{ code: "SAMPLEREG01", name: "기존 광역기관", sido: "기존시도", sigungu: "기존시군구", type: "regional", parent_code: "SAMPLECENTRAL", active: true }]) };
  };
  const result = await handler(event("PATCH", "/institutions/SAMPLEREG01", token({ role: "regional", agencyCode: "SAMPLEREG01" }), {
    name: "변경된 광역기관",
    sido: "조작된시도",
    sigungu: "조작된시군구",
  }));
  assert.equal(result.statusCode, 200);
  const update = requests.find((item) => item.method === "PATCH");
  assert.equal(update.body.name, "변경된 광역기관");
  assert.equal(update.body.sido, undefined);
  assert.equal(update.body.sigungu, "");
});

test("중앙기관이 광역지원기관을 등록하면 시군구를 공란으로 강제한다", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.includes("institutions?code=eq.SAMPLEREG03")) return { ok: true, status: 200, text: async () => "[]" };
    if (requestUrl.includes("institutions?code=eq.SAMPLECENTRAL")) return { ok: true, status: 200, text: async () => JSON.stringify([{ code: "SAMPLECENTRAL", type: "central", active: true }]) };
    if (requestUrl.endsWith("/rest/v1/institutions") && options.method === "POST") return { ok: true, status: 201, text: async () => JSON.stringify([JSON.parse(options.body)]) };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("POST", "/institutions", token({ role: "central", agencyCode: "SAMPLECENTRAL" }), {
    code: "SAMPLEREG03",
    type: "regional",
    sido: "가상신도",
    sigungu: "조작된 시군구",
    name: "가상광역지원기관 C",
    adminPassword: "admin1234",
  }));
  assert.equal(result.statusCode, 201);
  const institutionInsert = requests.find((item) => item.url.endsWith("/rest/v1/institutions") && item.method === "POST");
  assert.equal(institutionInsert.body.sigungu, "");
});

test("광역지원기관이 수행기관을 등록하면 본인 시도를 강제 적용한다", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.includes("institutions?code=eq.SAMPLEAG011")) return { ok: true, status: 200, text: async () => "[]" };
    if (requestUrl.includes("institutions?code=eq.SAMPLEREG01")) return { ok: true, status: 200, text: async () => JSON.stringify([{ code: "SAMPLEREG01", type: "regional", sido: "부모광역시", active: true }]) };
    if (requestUrl.endsWith("/rest/v1/institutions") && options.method === "POST") return { ok: true, status: 201, text: async () => JSON.stringify([JSON.parse(options.body)]) };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("POST", "/institutions", token({ role: "regional", agencyCode: "SAMPLEREG01" }), {
    code: "SAMPLEAG011",
    type: "agency",
    sido: "조작된시도",
    sigungu: "가상구",
    name: "가상 수행기관 011",
    adminPassword: "admin1234",
    intakePassword: "intake1234",
  }));
  assert.equal(result.statusCode, 201);
  const institutionInsert = requests.find((item) => item.url.endsWith("/rest/v1/institutions") && item.method === "POST");
  assert.equal(institutionInsert.body.parent_code, "SAMPLEREG01");
  assert.equal(institutionInsert.body.sido, "부모광역시");
});

test("기관 일괄 등록은 정상 행을 저장하고 오류 행만 실패 결과로 반환한다", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (requestUrl.includes("institutions?code=eq.BULKAG001")) return { ok: true, status: 200, text: async () => "[]" };
    if (requestUrl.includes("institutions?code=eq.SAMPLEREG01")) return { ok: true, status: 200, text: async () => JSON.stringify([{ code: "SAMPLEREG01", type: "regional", sido: "부모광역시", active: true }]) };
    if (requestUrl.endsWith("/rest/v1/institutions") && options.method === "POST") return { ok: true, status: 201, text: async () => JSON.stringify([JSON.parse(options.body)]) };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("POST", "/institutions/bulk", token({ role: "central", agencyCode: "SAMPLECENTRAL" }), {
    type: "agency",
    rows: [
      { rowNumber: 2, code: "BULKAG001", name: "정상 수행기관", parentCode: "SAMPLEREG01", sigungu: "가상구", adminPassword: "admin1234", intakePassword: "intake1234" },
      { rowNumber: 3, code: "BAD-CODE", name: "오류 수행기관", parentCode: "SAMPLEREG01", sigungu: "가상구", adminPassword: "admin1234", intakePassword: "intake1234" },
      { rowNumber: 4, code: "DUPLICATE01", name: "중복 A", parentCode: "SAMPLEREG01", sigungu: "가상구", adminPassword: "admin1234", intakePassword: "intake1234" },
      { rowNumber: 5, code: "DUPLICATE01", name: "중복 B", parentCode: "SAMPLEREG01", sigungu: "가상구", adminPassword: "admin1234", intakePassword: "intake1234" },
    ],
  }));
  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.totalCount, 4);
  assert.equal(payload.successCount, 1);
  assert.equal(payload.failureCount, 3);
  assert.equal(payload.results.find((item) => item.rowNumber === 2).success, true);
  assert.match(payload.results.find((item) => item.rowNumber === 3).message, /영문과 숫자/);
  assert.match(payload.results.find((item) => item.rowNumber === 4).message, /같은 파일/);
  assert.doesNotMatch(result.body, /admin1234|"intake1234"/);
  assert.equal(requests.filter((item) => item.url.endsWith("/rest/v1/institutions") && item.method === "POST").length, 1);
});

test("광역지원기관은 일괄 등록으로 광역기관을 추가할 수 없다", async () => {
  global.fetch = async () => {
    throw new Error("권한 검사 전에 Supabase를 호출하면 안 됩니다.");
  };
  const result = await handler(event("POST", "/institutions/bulk", token({ role: "regional", agencyCode: "SAMPLEREG01" }), {
    type: "regional",
    rows: [{ rowNumber: 2, code: "SAMPLEREG03" }],
  }));
  assert.equal(result.statusCode, 403);
  assert.match(JSON.parse(result.body).message, /기관담당자만/);
});

test("비활성 기관코드도 다시 등록할 수 없다", async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{ code: "OLDAGENCY", type: "agency", active: false }]),
  });
  const result = await handler(event("POST", "/institutions", token({ role: "central", agencyCode: "SAMPLECENTRAL" }), {
    code: "OLDAGENCY",
    type: "agency",
  }));
  assert.equal(result.statusCode, 409);
  assert.match(JSON.parse(result.body).message, /이미 사용 중/);
});

test("광역지원기관은 다른 광역기관의 수행기관을 수정할 수 없다", async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{ code: "SAMPLEAG004", name: "타 기관", type: "agency", parent_code: "SAMPLEREG02", active: true }]),
  });
  const result = await handler(event("PATCH", "/institutions/SAMPLEAG004", token({ role: "regional", agencyCode: "SAMPLEREG01" }), {
    name: "수정 시도",
    sido: "가상광역도",
    sigungu: "가상시 A",
  }));
  assert.equal(result.statusCode, 403);
  assert.match(JSON.parse(result.body).message, /권한/);
});

test("수행기관 관리자는 양식 관리 API에 접근할 수 없다", async () => {
  global.fetch = async () => {
    throw new Error("권한 검사 전에 Supabase를 호출하면 안 됩니다.");
  };

  const result = await handler(event("GET", "/checklist-templates", token({ role: "agency" })));
  assert.equal(result.statusCode, 403);
  assert.match(JSON.parse(result.body).message, /중앙관리자/);
});

test("중앙기관 관리자의 잘못된 선택형 문항을 거부한다", async () => {
  global.fetch = async () => {
    throw new Error("입력 검증 전에 Supabase를 호출하면 안 됩니다.");
  };

  const result = await handler(
    event("POST", "/checklist-templates", token({ role: "central" }), {
      title: "테스트 양식",
      questions: [
        {
          questionNo: 1,
          questionText: "선택해 주세요.",
          required: true,
          answerType: "single_choice",
          options: [{ optionText: "하나뿐인 선택지", score: 0 }],
        },
      ],
    })
  );

  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /두 개 이상의 선택지/);
});

test("잘못된 양식 ID를 Supabase 호출 전에 거부한다", async () => {
  global.fetch = async () => {
    throw new Error("ID 검증 전에 Supabase를 호출하면 안 됩니다.");
  };

  const result = await handler(
    event("GET", "/checklist-templates/not-a-uuid", token({ role: "central" }))
  );
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /ID가 올바르지 않습니다/);
});

test("관리자 제출 상세 응답을 문항번호 순서로 반환한다", async () => {
  let requestedUrl = "";
  global.fetch = async (url) => {
    const requestUrl = String(url);
    requestedUrl = requestUrl;
    if (!requestUrl.includes("/rest/v1/submissions?")) {
      throw new Error(`예상하지 못한 요청: ${requestUrl}`);
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111",
        institution_code: "SAMPLEAG001",
        checklist_type: null,
        template_id: "22222222-2222-4222-8222-222222222222",
        checklist_templates: {
          title: "점수 없는 이용자 설문",
          scoring_enabled: false,
          generation_method: "manual",
        },
        survey_date: "2026-07-28",
        worker_name: "테스트조사자",
        worker_phone: "010-0000-0000",
        client_name: "테스트대상자",
        client_gender: "여",
        client_birth: "1950-01-01",
        status: "확인 대기",
        total_score: 5,
        submission_answers: [
          { question_no: 2, question_text: "두 번째 문항", answer_label: "아니오", score: 0 },
          { question_no: 1, question_text: "첫 번째 문항", answer_label: "예", score: 5 },
        ],
      }]),
    };
  };

  const result = await handler(
    event(
      "GET",
      "/submissions/11111111-1111-4111-8111-111111111111",
      token({ role: "central" })
    )
  );

  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /checklist_templates\(title,scoring_enabled,generation_method\)/);
  const payload = JSON.parse(result.body);
  assert.deepEqual(payload.submission.answers.map((answer) => answer.question_no), [1, 2]);
  assert.deepEqual(payload.submission.answers.map((answer) => answer.answerLabel), ["예", "아니오"]);
  assert.equal(payload.submission.scoringEnabled, false);
  assert.equal(payload.submission.templateGenerationMethod, "manual");
});

test("관리자가 선택한 제출 상세를 일괄 조회한다", async () => {
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111",
        institution_code: "SAMPLEAG001",
        checklist_type: null,
        template_id: "22222222-2222-4222-8222-222222222222",
        checklist_templates: {
          title: "이용자 만족도조사",
          scoring_enabled: false,
          generation_method: "manual",
        },
        survey_date: "2026-07-29",
        worker_name: "테스트조사자",
        worker_phone: "010-0000-0000",
        client_name: "테스트대상자",
        status: "확인 완료",
        total_score: 0,
        submission_answers: [
          { question_no: 1, question_text: "만족하십니까?", answer_label: "매우 만족", score: 0 },
        ],
      }]),
    };
  };

  const result = await handler(
    event("POST", "/submissions/export-details", token({ role: "central" }), {
      templateId: "22222222-2222-4222-8222-222222222222",
      ids: ["11111111-1111-4111-8111-111111111111"],
    })
  );

  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /id=in\.\(11111111-1111-4111-8111-111111111111\)/);
  assert.match(requestedUrl, /submission_answers\(\*\)/);
  const payload = JSON.parse(result.body);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].checklistTitle, "이용자 만족도조사");
  assert.equal(payload.rows[0].templateGenerationMethod, "manual");
  assert.equal(payload.rows[0].answers[0].answerLabel, "매우 만족");
});

test("최근 제출 현황에 동적 설문의 실제 양식명을 반환한다", async () => {
  let requestedUrl = "";
  let requestedBody = null;
  global.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body || "{}");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        summary: {
          total: { total: 1, today: 1 },
          fall: { total: 0, today: 0 },
          depression: { total: 0, today: 0 },
          memory: { total: 0, today: 0 },
        },
        recent: [{
          id: "11111111-1111-4111-8111-111111111111",
          checklist_type: null,
          template_id: "22222222-2222-4222-8222-222222222222",
          checklist_title: "이용자 만족도 조사",
          client_name: "테스트 대상자",
          submitted_at: "2026-07-29T01:49:00.000Z",
        }],
        riskSummary: { fall: 0, depression: 0, memory: 0 },
      }),
    };
  };

  const result = await handler(event("GET", "/home-summary", token({ role: "central" })));

  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /\/rest\/v1\/rpc\/admin_home_summary$/);
  assert.deepEqual(requestedBody, { p_institution_codes: null });
  const payload = JSON.parse(result.body);
  assert.equal(payload.recent[0].templateId, "22222222-2222-4222-8222-222222222222");
  assert.equal(payload.recent[0].checklistTitle, "이용자 만족도 조사");
});

test("제출 목록은 필터와 페이지 정보를 DB 집계 함수에 전달한다", async () => {
  let requestedUrl = "";
  let requestedBody = null;
  global.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body || "{}");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        rows: [],
        pagination: { page: 11, limit: 20, totalCount: 458, totalPages: 23, start: 201, end: 220 },
      }),
    };
  };

  const request = event("GET", "/submissions", token({ role: "central" }));
  request.queryStringParameters = {
    page: "11",
    limit: "20",
    sido: "서울특별시",
    status: "확인 대기",
    search: "테스트",
  };
  const result = await handler(request);

  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /\/rest\/v1\/rpc\/admin_list_submissions$/);
  assert.equal(requestedBody.p_page, 11);
  assert.equal(requestedBody.p_limit, 20);
  assert.equal(requestedBody.p_sido, "서울특별시");
  assert.equal(requestedBody.p_status, "확인 대기");
  assert.equal(requestedBody.p_search, "테스트");
  assert.deepEqual(JSON.parse(result.body).pagination, {
    page: 11,
    limit: 20,
    totalCount: 458,
    totalPages: 23,
    start: 201,
    end: 220,
  });
});

test("통계는 조회 버튼에서 전달한 탭과 조건으로만 DB 집계 함수를 호출한다", async () => {
  let requestedUrl = "";
  let requestedBody = null;
  global.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body || "{}");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ view: "overview", rows: [], queriedAt: "2026-08-31T00:00:00Z" }),
    };
  };

  const request = event("GET", "/stats", token({ role: "central" }));
  request.queryStringParameters = {
    view: "overview",
    agencyCode: "SAMPLEAG001",
    type: "fall",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  };
  const result = await handler(request);

  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /\/rest\/v1\/rpc\/admin_submission_stats$/);
  assert.equal(requestedBody.p_view, "overview");
  assert.equal(requestedBody.p_agency_code, "SAMPLEAG001");
  assert.equal(requestedBody.p_checklist_type, "fall");
  assert.equal(requestedBody.p_start_date, "2026-08-01");
  assert.equal(requestedBody.p_end_date, "2026-08-31");
  assert.equal(JSON.parse(result.body).view, "overview");
});

test("문항번호 0을 자동 번호로 바꾸지 않고 거부한다", async () => {
  const response = await handler(
    event("POST", "/checklist-templates", token({ role: "central" }), {
      title: "번호 검증",
      questions: [
        {
          questionNo: 0,
          questionText: "유효하지 않은 문항",
          required: true,
          answerType: "text",
        },
      ],
    })
  );

  assert.equal(response.statusCode, 400);
});

test("선택지 순서 0을 자동 순서로 바꾸지 않고 거부한다", async () => {
  const response = await handler(
    event("POST", "/checklist-templates", token({ role: "central" }), {
      title: "선택지 순서 검증",
      questions: [
        {
          questionNo: 1,
          questionText: "냉방기가 있습니까?",
          required: true,
          answerType: "single_choice",
          options: [
            { optionText: "예", displayOrder: 0 },
            { optionText: "아니오", displayOrder: 2 },
          ],
        },
      ],
    })
  );

  assert.equal(response.statusCode, 400);
});

test("직원 토큰으로 운영 중인 동적 양식 목록을 조회한다", async () => {
  let requestedUrl = "";
  global.fetch = async (url) => {
    if (String(url).includes('/institutions?')) return {ok:true,status:200,text:async()=>JSON.stringify([{code:'CENTRAL_TEST',type:'agency',active:true}])};
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "냉방환경 실태조사",
            estimated_minutes: 5,
            scoring_enabled: false,
          },
        ]),
    };
  };

  const result = await handler(
    event("GET", "/intake/checklist-templates", token({ scope: "intake", role: "agency" }))
  );
  assert.equal(result.statusCode, 200);
  assert.match(requestedUrl, /checklist_templates\?status=eq\.active/);
  assert.equal(JSON.parse(result.body).templates[0].title, "냉방환경 실태조사");
});

test("동적 양식 제출은 서버의 문항과 선택지 점수로 저장한다", async () => {
  const templateId = "11111111-1111-4111-8111-111111111111";
  const submissionId = "22222222-2222-4222-8222-222222222222";
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ requestUrl, method, body });

    let data = [];
    if (requestUrl.includes('/institutions?')) {
      data = [{code:'CENTRAL_TEST',type:'agency',active:true}];
    } else if (requestUrl.includes("checklist_templates?id=eq.")) {
      data = [{
        id: templateId,
        title: "냉방환경 실태조사",
        status: "active",
        scoring_enabled: true,
      }];
    } else if (requestUrl.includes("template_questions?template_id=eq.")) {
      data = [{
        id: 10,
        template_id: templateId,
        question_no: 1,
        question_text: "냉방기가 있습니까?",
        required: true,
        answer_type: "single_choice",
      }];
    } else if (requestUrl.includes("question_options?question_id=in.")) {
      data = [
        { id: 100, question_id: 10, option_text: "예", score: 0, display_order: 1 },
        {
          id: 101,
          question_id: 10,
          option_text: "기타",
          score: 5,
          display_order: 2,
          requires_text: true,
          text_placeholder: "기타 사유를 입력해 주세요.",
        },
      ];
    } else if (requestUrl.endsWith("/rest/v1/submissions") && method === "POST") {
      data = [{ id: submissionId, ...body }];
    } else if (requestUrl.endsWith("/rest/v1/submission_answers") && method === "POST") {
      data = body;
    } else if (requestUrl.endsWith("/rest/v1/audit_logs") && method === "POST") {
      data = [{ id: 1 }];
    }

    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  };

  const missingTextResult = await handler(
    event("POST", "/submissions", token({ scope: "intake", role: "agency" }), {
      templateId,
      workerName: "김조사",
      workerPhone: "010-1234-5678",
      clientName: "이대상",
      clientGender: "여",
      clientBirth: "1940-01-01",
      answers: [{ questionId: 10, value: { optionIds: [101] } }],
    })
  );
  assert.equal(missingTextResult.statusCode, 400);
  assert.match(JSON.parse(missingTextResult.body).message, /'기타' 내용을 입력/);

  const result = await handler(
    event("POST", "/submissions", token({ scope: "intake", role: "agency" }), {
      templateId,
      workerName: "김조사",
      workerPhone: "010-1234-5678",
      clientName: "이대상",
      clientGender: "여",
      clientBirth: "1940-01-01",
      answers: [{
        questionId: 10,
        value: {
          optionIds: [101],
          optionTexts: { 101: "서비스 시간이 부족해서" },
        },
      }],
    })
  );

  assert.equal(result.statusCode, 201);
  const submissionInsert = requests.find((request) => request.requestUrl.endsWith("/rest/v1/submissions"));
  assert.equal(submissionInsert.body.template_id, templateId);
  assert.equal(submissionInsert.body.checklist_type, null);
  assert.equal(submissionInsert.body.total_score, 5);

  const answerInsert = requests.find((request) => request.requestUrl.endsWith("/rest/v1/submission_answers"));
  assert.equal(answerInsert.body[0].question_id, 10);
  assert.equal(answerInsert.body[0].answer_label, "기타: 서비스 시간이 부족해서");
  assert.deepEqual(answerInsert.body[0].answer_value.optionIds, [101]);
  assert.deepEqual(answerInsert.body[0].answer_value.optionTexts, {
    101: "서비스 시간이 부족해서",
  });
  assert.equal(answerInsert.body[0].score, 5);
});

test("중앙기관 관리자가 자연어로 AI 양식 초안을 생성한다", async () => {
  globalThis.Netlify = {
    env: {
      get(name) {
        return {
          NETLIFY_AI_GATEWAY_BASE_URL: "https://netlify-ai-gateway.example.test",
          NETLIFY_AI_GATEWAY_KEY: "test-netlify-ai-key",
        }[name];
      },
    },
  };
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const fixture=accountResponse(url,settingsRow());if(fixture)return fixture;
    const requestUrl = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ requestUrl, body });

    if (requestUrl.includes("/v1/responses")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
                title: "노인 냉방환경 실태조사",
                description: "냉방환경을 확인합니다.",
                purpose: "기후위기 대응",
                targetAudience: "생활안전점검 대상자",
                estimatedMinutes: 5,
                scoringEnabled: false,
                questions: Array.from({ length: 60 }, (_, index) => ({
                  questionNo: index + 1,
                  questionText: `냉방환경 세부 점검 ${index + 1}`,
                  required: true,
                  answerType: "single_choice",
                  helpText: "표의 각 행을 독립 문항으로 변환",
                  options: [
                    { optionText: "예", score: 0, displayOrder: 1 },
                    { optionText: "아니오", score: 0, displayOrder: 2 },
                  ],
                })),
              }),
          usage: { input_tokens: 120, output_tokens: 80 },
        }),
      };
    }

    if (requestUrl.endsWith("/rest/v1/ai_generation_logs")) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: 7, ...body }]),
      };
    }
    throw new Error(`예상하지 못한 요청: ${requestUrl}`);
  };

  const result = await handler(
    event("POST", "/checklist-templates/ai-draft", token({ role: "central" }), {
      topic: "노인 대상 기후위기 냉방환경 실태조사",
      targetAudience: "생활안전점검 대상자",
      questionCount: 60,
    })
  );

  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.draft.generationMethod, "ai_text");
  assert.equal(payload.draft.questions.length, 60);
  assert.equal(payload.draft.questions[0].answerType, "single_choice");
  assert.equal(payload.generationLogId, 7);
  assert.equal(payload.model, "gpt-5.4-mini");

  const aiRequest = requests.find((request) => request.requestUrl.includes("/v1/responses"));
  assert.equal(aiRequest.requestUrl, "https://api.openai.com/v1/responses");
  assert.equal(aiRequest.body.text.format.type, "json_object");
  assert.equal(aiRequest.body.model, "gpt-5.4-mini");
  const logRequest = requests.find((request) => request.requestUrl.endsWith("/rest/v1/ai_generation_logs"));
  assert.equal(logRequest.body.status, "success");
  assert.equal(logRequest.body.input_tokens, 120);
  assert.equal(logRequest.body.request_metadata.requested_question_count, 60);
  delete globalThis.Netlify;
});

test("AI 양식 초안은 100개를 초과하는 문항 요청을 거부한다", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("외부 요청 전에 문항 수를 검증해야 합니다.");
  };

  const result = await handler(
    event("POST", "/checklist-templates/ai-draft", token({ role: "central" }), {
      topic: "대규모 이용자 설문",
      questionCount: 101,
    })
  );

  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /100개/);
  assert.equal(fetchCalled, false);
});

test("AI file draft accepts a valid image and logs metadata without source content", async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const fixture=accountResponse(url,settingsRow());if(fixture)return fixture;
    const requestUrl = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ requestUrl, body });

    if (requestUrl.includes("/v1/responses")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                blocked: false,
                blockedReason: "",
                draft: {
                  title: "Cooling equipment survey",
                  description: "Checks the cooling environment.",
                  purpose: "Climate response",
                  targetAudience: "Older adults",
                  estimatedMinutes: 5,
                  scoringEnabled: false,
                  questions: [
                    {
                      questionNo: 1,
                      questionText: "대상자 이름을 적어주세요.",
                      required: true,
                      answerType: "text",
                      helpText: "",
                      options: [],
                    },
                    {
                      questionNo: 1,
                      questionText: "Is working cooling equipment available?",
                      required: true,
                      answerType: "single_choice",
                      helpText: "",
                      options: [
                        { optionText: "Yes", score: 0, displayOrder: 9 },
                        { optionText: "No", score: 0, displayOrder: 9 },
                      ],
                    },
                  ],
                },
              }),
            }],
          }],
          usage: { input_tokens: 240, output_tokens: 90 },
        }),
      };
    }
    if (requestUrl.endsWith("/rest/v1/ai_generation_logs")) {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: 9, ...body }]),
      };
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const secondPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const result = await handler(
    event("POST", "/checklist-templates/ai-file-draft", token({ role: "central" }), {
      files: [
        { filename: "reference-1.png", mimeType: "image/png", fileBase64: png.toString("base64") },
        { filename: "reference-2.png", mimeType: "image/png", fileBase64: secondPng.toString("base64") },
      ],
      targetAudience: "Older adults",
      questionCount: 60,
    })
  );

  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.draft.generationMethod, "ai_file");
  assert.equal(payload.generationLogId, 9);
  assert.equal(payload.draft.questions.length, 1);
  assert.equal(payload.draft.questions[0].questionNo, 1);
  assert.deepEqual(payload.draft.questions[0].options.map((option) => option.displayOrder), [1, 2]);

  const aiRequest = requests.find((request) => request.requestUrl.includes("/v1/responses"));
  assert.equal(aiRequest.body.model, "gpt-5.4-mini");
  assert.equal(aiRequest.body.input[0].content[0].type, "input_image");
  assert.equal(aiRequest.body.input[0].content[1].type, "input_image");
  assert.equal(aiRequest.body.input[0].content[2].type, "input_text");
  assert.match(aiRequest.body.instructions, /표, 행렬, 척도형 문항/);
  assert.match(aiRequest.body.instructions, /빈 개인정보 입력란/);
  assert.match(aiRequest.body.instructions, /여러 파일/);
  const logRequest = requests.find((request) => request.requestUrl.endsWith("/rest/v1/ai_generation_logs"));
  assert.equal(logRequest.body.action, "import_file");
  assert.equal(logRequest.body.request_metadata.file_count, 2);
  assert.deepEqual(logRequest.body.request_metadata.mime_types, ["image/png", "image/png"]);
  assert.deepEqual(logRequest.body.request_metadata.file_sizes_bytes, [png.length, secondPng.length]);
  assert.equal(logRequest.body.request_metadata.total_file_size_bytes, png.length + secondPng.length);
  assert.equal("filename" in logRequest.body.request_metadata, false);
  assert.equal(JSON.stringify(logRequest.body).includes(png.toString("base64")), false);
});

test("AI file draft rejects mismatched file signatures before external calls", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("External request must not run before validation.");
  };

  const result = await handler(
    event("POST", "/checklist-templates/ai-file-draft", token({ role: "central" }), {
      filename: "fake.pdf",
      mimeType: "application/pdf",
      fileBase64: Buffer.from("not a pdf").toString("base64"),
      questionCount: 8,
    })
  );

  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).message, /파일 내용/);
  assert.equal(fetchCalled, false);
});

test("modern AI file route streams validation errors as a JSON envelope", async () => {
  globalThis.Netlify = {
    env: {
      get: (name) => process.env[name] || "",
    },
  };
  const { default: modernHandler } = await import("../netlify/functions/api.mjs");
  const request = new Request("https://example.test/api/checklist-templates/ai-file-draft", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token({ role: "central" })}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: "fake.pdf",
      mimeType: "application/pdf",
      fileBase64: Buffer.from("not a pdf").toString("base64"),
      questionCount: 60,
    }),
  });

  const response = await modernHandler(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(events[0].type, "started");
  const errorEvent = events.find((item) => item.type === "error");
  assert.equal(errorEvent.payload.streamedError, true);
  assert.equal(errorEvent.payload.statusCode, 400);
  delete globalThis.Netlify;
});
