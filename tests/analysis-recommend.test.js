const {accountResponse}=require('./support/account-ai-fixture');
// STEP 2 AI에게 추천 더 받기 — AI 입력 · AI 답 검사 · 키가 없을 때의 동작 · 참고 구간 표시
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NETLIFY_AUTH_SECRET = "test-auth-secret";

const { handler } = require("../netlify/functions/api-legacy.cjs");
const rec = require("../netlify/functions/lib/analysis-recommend.js");
const report = require("../netlify/functions/lib/analysis-report.js");

function token(payload) {
  const encoded = Buffer.from(
    JSON.stringify({ scope: "admin", agencyCode: "AG1", role: "agency", exp: Math.floor(Date.now() / 1000) + 3600, ...payload })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
const event = (method, path, authToken, body) => ({ httpMethod: method, rawUrl: `http://localhost/api${path}`, headers: { authorization: `Bearer ${authToken}` }, body: body === undefined ? null : JSON.stringify(body) });

// ── 가상 자체 설문 ────────────────────────────────────────────────────────────
const QUESTIONS = [
  { questionNo: 1, questionText: "야간 조명은 충분한가요?", answerType: "single_choice", options: [{ optionText: "충분함", score: 0 }, { optionText: "부족함", score: 2 }, { optionText: "기타", score: 1, requiresText: true }] },
  { questionNo: 2, questionText: "최근 1년 사이 넘어진 적이 있나요?", answerType: "single_choice", options: [{ optionText: "없음", score: 0 }, { optionText: "있음", score: 3 }] },
  { questionNo: 3, questionText: "위험하다고 느끼는 곳을 모두 고르세요.", answerType: "multiple_choice", options: [{ optionText: "욕실", score: 1 }, { optionText: "계단", score: 2 }] },
  { questionNo: 4, questionText: "그 밖에 불편한 점을 적어 주세요.", answerType: "textarea", options: [] },
  { questionNo: 5, questionText: "보호자 연락처가 있나요?", answerType: "single_choice", options: [{ optionText: "예", score: 0 }, { optionText: "아니오", score: 1 }] },
];
const ITEM_RATES = [
  { questionNo: "1", total: 80, multi: false, primaryLabel: "부족함", primaryRate: 41.3, distribution: [{ label: "충분함", count: 44, pct: 55 }, { label: "부족함", count: 33, pct: 41.3 }, { label: "기타", count: 3, pct: 3.8 }] },
  { questionNo: "2", total: 80, multi: false, primaryLabel: "있음", primaryRate: 22.5, distribution: [{ label: "없음", count: 62, pct: 77.5 }, { label: "있음", count: 18, pct: 22.5 }] },
  { questionNo: "3", total: 70, multi: true, primaryLabel: "계단", primaryRate: 51.4, distribution: [{ label: "욕실", count: 40, pct: 57.1 }, { label: "계단", count: 36, pct: 51.4 }] },
  { questionNo: "5", total: 80, multi: false, primaryLabel: "예", primaryRate: 100, distribution: [{ label: "예", count: 80, pct: 100 }] }, // 응답이 한 가지뿐
];
const SUMMARY = { n: 80, withScore: 80, minScore: 0, maxScore: 9, ageKnown: 76, genderKnown: 80, institutionCount: 3, monthCount: 1, statusCounts: { "확인 완료": 50, "확인 대기": 30 } };
const FACTS = { sigunguCount: 1, statusKinds: 2 };
const SURVEY = { title: "주거환경 안전 점검", purpose: "낙상 위험 환경 파악", targetAudience: "독거 어르신", scoringEnabled: true };
const EXISTING = rec.sanitizeExisting([
  { row: { kind: "age" }, col: { kind: "score" } },
  { row: { kind: "score" }, col: { kind: "question", questionNo: "1" } },
  { row: { kind: "nope" }, col: { kind: "all" } }, // 모르는 종류는 버린다
]);
const context = (overrides = {}) => rec.buildRecommendContext({ survey: SURVEY, questions: QUESTIONS, summary: SUMMARY, itemRates: ITEM_RATES, facts: FACTS, existing: EXISTING, ...overrides });
const check = (proposals, overrides = {}) => rec.validateRecommendations({ 추천: proposals }, { context: context(), questions: QUESTIONS, itemRates: ITEM_RATES, summary: SUMMARY, facts: FACTS, hasScore: true, existing: EXISTING, ...overrides });
const P = (row, col, why = "두 문항을 함께 보면 어떤 환경에서 넘어짐이 많은지 볼 수 있습니다.", extra = {}) => ({ 행: row, 열: col, 근거: why, 주의: "", ...extra });
const Q = (no) => ({ 종류: "문항", 문항_번호: no });

// ── AI 입력 ───────────────────────────────────────────────────────────────────
test("AI 입력 — 선택형 문항 구조와 집계만 담고, 서술형 문항은 개수만 알린다", () => {
  const ctx = context();
  assert.equal(ctx.설문.목적, "낙상 위험 환경 파악");
  assert.deepEqual(ctx.선택형_문항.map((q) => q.번호), [1, 2, 3, 5]);
  assert.equal(ctx.표로_나누지_않는_서술형_문항_수, 1);
  assert.deepEqual(ctx.선택형_문항[0].보기, ["충분함 (0점)", "부족함 (2점)", "기타 (1점)"]);
  assert.equal(ctx.선택형_문항[2].종류, "복수 선택");
  assert.deepEqual(ctx.이미_있는_기준, ["연령대 × 총점 구간", "총점 구간 × 문항 1 응답"]);
  // 기관이 3곳 · 조사 월 1개 · 시군구 1곳 → 기관은 쓸 수 있고 조사 월·시군구는 없다
  assert.ok(ctx.쓸_수_있는_기준.includes("기관"));
  assert.equal(ctx.쓸_수_있는_기준.includes("조사 월"), false);
  assert.equal(ctx.쓸_수_있는_기준.includes("시군구"), false);
  const input = rec.buildRecommendRequest({ model: "m", context: ctx }).input[0].content[0].text;
  assert.match(input, /야간 조명은 충분한가요/);
  assert.doesNotMatch(input, /불편한 점을 적어|client|birth|gender/, "서술형 문항 문장·사람 정보는 보내지 않는다");
  assert.match(rec.recommendInstructions(), /경계값이나 위험 기준점은 정하지 마세요/);
});

// ── AI 답 검사 ────────────────────────────────────────────────────────────────
test("AI 답 검사 — 문항 × 문항 · 기관 × 문항처럼 쓸 수 있는 추천은 화면 축으로 바꿔 돌려준다", () => {
  const { recommendations, rejected, warnings } = check([
    P(Q(1), Q(2)),
    P({ 종류: "기관" }, Q(3), "기관마다 위험 장소가 다른지 봅니다.", { 주의: "기관 간 차이는 이용자 구성 차이일 수 있습니다." }),
  ]);
  assert.deepEqual(rejected, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(recommendations.map((item) => [item.row, item.col]), [
    [{ kind: "question", questionNo: 1 }, { kind: "question", questionNo: 2 }],
    [{ kind: "institution" }, { kind: "question", questionNo: 3 }],
  ]);
  assert.equal(recommendations[1].warn, "기관 간 차이는 이용자 구성 차이일 수 있습니다.");
});

test("AI 답 검사 — 없는·서술형·응답이 한 가지뿐인 문항, 지원하지 않거나 값이 없는 기준을 이유와 함께 거른다", () => {
  const { recommendations, rejected } = check([
    P(Q(99), { 종류: "기관" }),
    P(Q(4), { 종류: "연령대" }),
    P(Q(5), { 종류: "성별" }),
    P({ 종류: "소득 구간" }, Q(1)),
    P({ 종류: "조사 월" }, Q(1)),
    P({ 종류: "시군구" }, Q(2)),
    P({ 종류: "전체" }, { 종류: "전체" }),
    P(Q(2), Q(2)),
    P({ 종류: "성별" }, Q(3), ""),
  ]);
  assert.deepEqual(recommendations, []);
  const reasons = rejected.map((item) => `${item.기준} → ${item.이유}`);
  assert.match(reasons[0], /문항 99 응답 × 기관 → 설문에 없는 문항/);
  assert.match(reasons[1], /서술형 문항이라/);
  assert.match(reasons[2], /응답이 한 가지뿐/);
  assert.match(reasons[3], /지원하지 않는 기준입니다 \(소득 구간\)/);
  assert.match(reasons[4], /조사 월이 한 달뿐/);
  assert.match(reasons[5], /시군구가 한 곳뿐/);
  assert.match(reasons[6], /나눌 기준이 없습니다/);
  assert.match(reasons[7], /행과 열이 같은 기준/);
  assert.match(reasons[8], /근거가 없습니다/);
});

test("AI 답 검사 — 이미 있는 기준(행·열을 바꾼 것 포함)과 같은 추천, AI 끼리 겹치는 추천을 거른다", () => {
  const { recommendations, rejected } = check([
    P({ 종류: "총점 구간" }, { 종류: "연령대" }),
    P(Q(1), { 종류: "총점 구간" }),
    P(Q(1), Q(3)),
    P(Q(3), Q(1)),
  ]);
  assert.equal(recommendations.length, 1);
  assert.deepEqual(rejected.map((item) => item.이유), ["이미 있는 기준과 같습니다", "이미 있는 기준과 같습니다", "이미 있는 기준과 같습니다"]);
});

test("AI 답 검사 — 총점·연령 경계값은 AI 가 정하지 못한다 (버리고 알림) · 배점 없는 설문은 총점 구간 자체를 거른다", () => {
  const scored = check([P({ 종류: "총점 구간", 경계값: [3, 7] }, { 종류: "성별" }), P({ 종류: "연령대", 구간: [70, 80] }, Q(2))]);
  assert.equal(scored.recommendations.length, 2);
  assert.deepEqual(scored.recommendations[0].row, { kind: "score" }, "경계값은 돌려주지 않는다 (화면이 규칙의 참고 구간을 넣음)");
  assert.equal(scored.warnings.length, 2);
  assert.match(scored.warnings[0], /AI가 정한 총점 구간 경계값은 쓰지 않고/);
  const unscored = check([P({ 종류: "총점 구간" }, { 종류: "성별" })], { hasScore: false, context: context({ survey: { ...SURVEY, scoringEnabled: false } }) });
  assert.match(unscored.rejected[0].이유, /배점을 쓰지 않는 설문이라/);
});

test("AI 답 검사 — 최대 5개 · 문장 길이 · 개인정보 형태 가림 · 통계에 없는 수치는 경고", () => {
  const many = check([
    P(Q(1), Q(2)), P(Q(1), Q(3)), P(Q(2), Q(3)), P({ 종류: "기관" }, Q(1)), P({ 종류: "기관" }, Q(2)), P({ 종류: "성별" }, Q(1)),
  ]);
  assert.equal(many.recommendations.length, rec.MAX_RECOMMENDATIONS);
  assert.match(many.rejected[0].이유, /최대 5개/);

  const long = "가".repeat(400);
  const detail = check([P(Q(1), Q(2), `${long} 담당 010-1234-5678`, { 주의: "응답자의 87.65%가 여성입니다." })]);
  const item = detail.recommendations[0];
  assert.ok(item.why.length <= 220);
  const masked = check([P(Q(1), Q(2), "담당자 010-1234-5678 에게 확인한 조합입니다.")]);
  assert.match(masked.recommendations[0].why, /\[휴대전화번호 가림\]/);
  assert.match(masked.warnings.join(" "), /개인정보 형태 1건을 가렸습니다/);
  assert.match(item.warn, /87\.65은\(는\) 통계에서 찾지 못했습니다/);
  assert.throws(() => rec.validateRecommendations(null, { context: context() }), /형식이 올바르지 않습니다/);
  assert.deepEqual(rec.validateRecommendations({ 추천: [] }, { context: context() }).recommendations, [], "쓸모 있는 조합이 없으면 빈 목록");
});

// ── 서버 경로 ─────────────────────────────────────────────────────────────────
test("AI 추천 요청 — 키가 없으면 통계를 읽지도, AI 를 부르지도 않고, 공용 키로 대신하지 않는다", async () => {
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = "project-wide-key";
  process.env.NETLIFY_AI_GATEWAY_KEY = "project-gateway-key";
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://project-gateway.example.test";
  const requests = [];
  const oldFetch = global.fetch;
  global.fetch = async (url) => { const response=accountResponse(url); if(response)return response; requests.push(String(url)); return { ok: true, status: 200, text: async () => "[]", json: async () => ({}) }; };
  try {
    const result = await handler(event("POST", "/analysis/recommend", token(), { checklistType: "fall", existing: [] }));
    assert.equal(result.statusCode, 412);
    assert.match(JSON.parse(result.body).message, /미설정이거나 사용 중지/);
    assert.deepEqual(requests, [], "제출건 조회도 AI 요청도 없어야 한다");
    const intake = await handler(event("POST", "/analysis/recommend", token({ scope: "intake" }), { checklistType: "fall" }));
    assert.equal(intake.statusCode, 403);
  } finally {
    global.fetch = oldFetch;
    Object.keys(process.env).forEach((key) => { if (!(key in saved)) delete process.env[key]; });
    Object.assign(process.env, saved);
  }
});

test("AI 추천 요청은 스트리밍 경로로 감싸 오류도 JSON 줄로 전달한다", async () => {
  globalThis.Netlify = { env: { get: (name) => process.env[name] || "" } };
  const oldFetch = global.fetch;
  global.fetch = async url => {const response=accountResponse(url);if(response)return response;throw Error("Unexpected external call");};
  try {
    const { default: modernHandler } = await import("../netlify/functions/api.mjs");
    const response = await modernHandler(new Request("https://example.test/api/analysis/recommend", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checklistType: "fall" }),
    }));
    assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.find((item) => item.type === "error").payload.statusCode, 412);
  } finally {
    global.fetch = oldFetch;
    delete globalThis.Netlify;
  }
});

// ── 결과 분석(STEP 4)의 참고 구간 표시 ─────────────────────────────────────────
test("결과 분석 AI 입력 — 검증된 위험 구간이 아닌 총점 구간은 '참고 구간'으로 알리고 위험 수준으로 해석하지 말라고 지시한다", () => {
  const table = (boundaries) => ({
    spec: { row: { kind: "number_bins", field: "score", boundaries }, col: { kind: "all" } },
    rowLabels: ["낮음", "높음"], colLabels: ["전체"], cells: [[{ count: 5 }], [{ count: 3 }]], rowTotals: [5, 3], colTotals: [8], grandTotal: 8, droppedRecords: 0,
  });
  const build = (filters, boundaries) => report.buildReportContext({ surveyTitle: "t", filters, recordCount: 8, summary: { n: 8 }, tables: [table(boundaries)] });
  const builtin = build({ checklistType: "fall" }, [26, 60]);
  assert.equal(builtin.표[0].기준, "총점 구간 × 전체");
  assert.doesNotMatch(report.buildReportRequest({ model: "m", context: builtin }).instructions, /참고 구간/);

  const template = build({ templateId: "x" }, [3, 6]);
  assert.match(template.표[0].기준, /참고 구간 · 점수 범위를 나눈 것이며 검증된 위험 기준 아님/);
  assert.match(report.buildReportRequest({ model: "m", context: template }).instructions, /위험 수준이 아닙니다/);
  assert.match(build({ checklistType: "fall" }, [20, 60]).표[0].기준, /참고 구간/, "기본 설문도 경계값을 바꾸면 참고 구간");
});
