// 집계 및 통계 — 자체 설문까지 확인 상태를 세는지, 설문 양식 목록 권한이 맞는지 검사한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NETLIFY_AUTH_SECRET = "test-auth-secret";

const { handler } = require("../netlify/functions/api-legacy.cjs");

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function token(payload) {
  const encoded = Buffer.from(
    JSON.stringify({ scope: "admin", agencyCode: "CENTRAL_TEST", role: "central", exp: Math.floor(Date.now() / 1000) + 3600, ...payload })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function event(method, path, authToken, query) {
  return { httpMethod: method, rawUrl: `http://localhost/api${path}`, headers: { authorization: `Bearer ${authToken}` }, queryStringParameters: query || {}, body: null };
}

// 요청 주소별로 응답을 고르는 가짜 Supabase. 제출건 목록은 HEAD 개수 + limit/offset 을 흉내 낸다.
function fakeSupabase({ rpcRows = [], submissions = [], templates = [], templateDetail = null, headCount } = {}) {
  const calls = [];
  const json = (value) => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
  const fetch = async (url, options = {}) => {
    const u = decodeURIComponent(String(url));
    calls.push({ url: u, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (u.includes("/rpc/admin_submission_stats")) return json({ view: "overview", rows: rpcRows, queriedAt: "2026-09-14T00:00:00Z" });
    if (u.includes("/rest/v1/submissions?")) {
      if (options.method === "HEAD") {
        const count = headCount !== undefined ? headCount : submissions.length;
        return { ok: true, status: 200, headers: { get: (n) => (String(n).toLowerCase() === "content-range" ? `0-0/${count}` : null) }, text: async () => "" };
      }
      const offset = Number((u.match(/[?&]offset=(\d+)/) || [])[1] || 0);
      const limit = Number((u.match(/[?&]limit=(\d+)/) || [])[1] || submissions.length);
      return json(submissions.slice(offset, offset + limit));
    }
    if (u.includes("/rest/v1/checklist_templates?id=eq.")) return json(templateDetail ? [templateDetail.row] : []);
    if (u.includes("/rest/v1/template_questions?")) return json(templateDetail ? templateDetail.questions : []);
    if (u.includes("/rest/v1/question_options?")) return json(templateDetail ? templateDetail.options : []);
    if (u.includes("/rest/v1/checklist_templates?")) return json(templates);
    if (u.includes("/rest/v1/institutions?")) return json([{ code: "AG1" }, { code: "AG2" }]);
    return json([]);
  };
  return { fetch, calls };
}

test("제출 현황 — 자체 설문 제출건의 확인 상태까지 더해 확인 대기 + 완료 = 제출 건수", async () => {
  const fake = fakeSupabase({
    // DB 함수: AG1 은 기본 3종 5건 + 자체 설문 3건 = 8건. 기본 3종 상태만 들어 있다.
    rpcRows: [
      { institution_code: "AG1", total: 8, unique_clients: 6, fall_total: 5, fall_waiting: 2, fall_done: 3, depression_waiting: 0, depression_done: 0, memory_waiting: 0, memory_done: 0 },
      { institution_code: "AG2", total: 1, unique_clients: 1, memory_total: 1, memory_waiting: 0, memory_done: 1 },
    ],
    submissions: [
      { institution_code: "AG1", status: "확인 대기" },
      { institution_code: "AG1", status: "확인 완료" },
      { institution_code: "AG1", status: "확인 완료" },
    ],
  });
  global.fetch = fake.fetch;
  const result = await handler(event("GET", "/stats", token(), { view: "overview" }));
  assert.equal(result.statusCode, 200);
  const rows = JSON.parse(result.body).rows;
  const ag1 = rows.find((r) => r.institution_code === "AG1");
  assert.equal(ag1.waiting_total, 3); // 기본 2 + 자체 1
  assert.equal(ag1.done_total, 5); // 기본 3 + 자체 2
  assert.equal(ag1.waiting_total + ag1.done_total, ag1.total);
  const ag2 = rows.find((r) => r.institution_code === "AG2");
  assert.deepEqual([ag2.waiting_total, ag2.done_total], [0, 1]);

  const read = fake.calls.find((c) => c.url.includes("/submissions?") && c.method !== "HEAD");
  assert.match(read.url, /template_id=not\.is\.null/, "자체 설문 제출건만 읽는다 (기본 3종은 DB 함수 결과를 쓴다)");
  assert.match(read.url, /select=institution_code,status/);
});

test("제출 현황 — 기본 설문 하나를 고르면 자체 설문 제출건은 읽지 않는다", async () => {
  const fake = fakeSupabase({ rpcRows: [{ institution_code: "AG1", total: 5, fall_waiting: 2, fall_done: 3 }] });
  global.fetch = fake.fetch;
  const result = await handler(event("GET", "/stats", token(), { view: "overview", type: "fall" }));
  const [row] = JSON.parse(result.body).rows;
  assert.deepEqual([row.waiting_total, row.done_total], [2, 3]);
  assert.equal(fake.calls.some((c) => c.url.includes("/submissions?")), false);
});

test("제출 현황 — 자체 설문을 고르면 그 양식의 제출건만 기관별로 센다 (DB 함수는 부르지 않는다)", async () => {
  const fake = fakeSupabase({
    submissions: [
      { institution_code: "AG1", client_id: "1000001", status: "확인 대기" },
      { institution_code: "AG1", client_id: "1000001", status: "확인 완료" },
      { institution_code: "AG1", client_id: null, status: "확인 완료" },
      { institution_code: "AG2", client_id: "2000001", status: "확인 대기" },
    ],
  });
  global.fetch = fake.fetch;
  const result = await handler(event("GET", "/stats", token({ role: "regional", agencyCode: "REG1" }), {
    view: "overview", templateId: TEMPLATE_ID, sido: "가상도", startDate: "2026-09-01",
  }));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  const ag1 = body.rows.find((r) => r.institution_code === "AG1");
  assert.deepEqual({ total: ag1.total, unique_clients: ag1.unique_clients, waiting: ag1.waiting_total, done: ag1.done_total }, { total: 3, unique_clients: 1, waiting: 1, done: 2 });
  assert.equal(fake.calls.some((c) => c.url.includes("/rpc/admin_submission_stats")), false);
  const read = fake.calls.find((c) => c.url.includes("/submissions?") && c.method !== "HEAD");
  assert.match(read.url, new RegExp(`template_id=eq\\.${TEMPLATE_ID}`));
  assert.match(read.url, /institution_code=in\.\(AG1,AG2\)/, "광역기관은 관할 기관으로만 좁힌다");
  assert.match(read.url, /institutions\.sido=eq\.가상도/);
  assert.match(read.url, /institutions!inner/);
  assert.match(read.url, /survey_date=gte\.2026-09-01/);
});

test("제출 현황 — 자체 설문 제출건이 너무 많으면 숫자를 몰래 빼지 않고 표시한다", async () => {
  const fake = fakeSupabase({ rpcRows: [{ institution_code: "AG1", total: 30000, fall_waiting: 1, fall_done: 2 }], headCount: 25000 });
  global.fetch = fake.fetch;
  const result = await handler(event("GET", "/stats", token(), { view: "overview" }));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.templateStatusSkipped, true);
  assert.deepEqual([body.rows[0].waiting_total, body.rows[0].done_total], [1, 2]);
});

test("관리구분 분포는 설문을 선택하지 않으면 거부한다", async () => {
  const fake = fakeSupabase();
  global.fetch = fake.fetch;
  const result = await handler(event("GET", "/stats", token(), { view: "distribution" }));
  assert.equal(result.statusCode,400);
  assert.equal(fake.calls.filter((c) => c.url.includes("/rest/v1/")).length, 0);
});

test("설문 양식 목록 — 모든 관리자 권한이 볼 수 있고 작성 중 양식은 요청하지 않는다", async () => {
  const fake = fakeSupabase({ templates: [{ id: TEMPLATE_ID, title: "주거환경 점검", status: "active", scoring_enabled: true, created_by: "CENTRAL" }] });
  global.fetch = fake.fetch;
  for (const role of ["central", "regional", "agency"]) {
    const result = await handler(event("GET", "/stats/templates", token({ role, agencyCode: role === "agency" ? "AG1" : "X" })));
    assert.equal(result.statusCode, 200, `${role} 권한`);
    assert.deepEqual(JSON.parse(result.body).templates, [{ id: TEMPLATE_ID, title: "주거환경 점검", status: "active", scoringEnabled: true, managementEnabled:false,managementBands:[] }]);
  }
  const listCall = fake.calls.find((c) => c.url.includes("/checklist_templates?"));
  assert.match(listCall.url, /status=in\.\(active,closed\)/);

  const intake = await handler(event("GET", "/stats/templates", token({ scope: "intake" })));
  assert.equal(intake.statusCode, 403);
});

test("설문 양식 문항 — 운영 중·종료 양식만, 필요한 필드만 돌려준다", async () => {
  const detail = (status) => ({
    row: { id: TEMPLATE_ID, title: "주거환경 점검", status, scoring_enabled: true, created_by: "CENTRAL", approved_by: "CENTRAL" },
    questions: [{ id: "q1", question_no: 1, question_text: "바닥 상태", required: true, answer_type: "single_choice" }],
    options: [{ id: "o1", question_id: "q1", option_text: "양호", score: 0, display_order: 1 }],
  });
  global.fetch = fakeSupabase({ templateDetail: detail("closed") }).fetch;
  const ok = await handler(event("GET", `/stats/templates/${TEMPLATE_ID}`, token({ role: "agency", agencyCode: "AG1" })));
  assert.equal(ok.statusCode, 200);
  const template = JSON.parse(ok.body).template;
  assert.deepEqual(template.questions, [{ questionNo: 1, questionText: "바닥 상태", answerType: "single_choice", options: [{ optionText: "양호", score: 0 }] }]);
  assert.equal("createdBy" in template, false);

  global.fetch = fakeSupabase({ templateDetail: detail("draft") }).fetch;
  const draft = await handler(event("GET", `/stats/templates/${TEMPLATE_ID}`, token()));
  assert.equal(draft.statusCode, 404);

  const badId = await handler(event("GET", "/stats/templates/not-a-uuid", token()));
  assert.equal(badId.statusCode, 400);
});
