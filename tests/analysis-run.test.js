const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NETLIFY_AUTH_SECRET = "test-auth-secret";

const { handler } = require("../netlify/functions/api-legacy.cjs");
const { normalizeSubmissions, summarize, itemRates, ageFromBirth, median } = require("../netlify/functions/lib/analysis.js");

function token(payload) {
  const encoded = Buffer.from(
    JSON.stringify({ scope: "admin", agencyCode: "CENTRAL_TEST", role: "central", exp: Math.floor(Date.now() / 1000) + 3600, ...payload })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function event(method, path, authToken, body) {
  return { httpMethod: method, rawUrl: `http://localhost/api${path}`, headers: { authorization: `Bearer ${authToken}` }, body: body === undefined ? null : JSON.stringify(body) };
}

// 실제 Supabase 처럼 동작하는 가짜 fetch: HEAD(count=exact) 에는 전체 개수를, 목록 요청에는
// limit/offset 만큼만 잘라 준다. maxRows 를 주면 Supabase 의 max-rows 상한도 흉내 낸다.
function pagedFetch(rows, { maxRows = Infinity, onRequest = () => {} } = {}) {
  return async (url, options = {}) => {
    const u = String(url);
    onRequest(u, options);
    if (options.method === "HEAD") {
      return { ok: true, status: 200, headers: { get: (name) => (String(name).toLowerCase() === "content-range" ? `0-0/${rows.length}` : null) }, text: async () => "" };
    }
    const offset = Number((u.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const limit = Math.min(Number((u.match(/[?&]limit=(\d+)/) || [])[1] || rows.length), maxRows);
    return { ok: true, status: 200, text: async () => JSON.stringify(rows.slice(offset, offset + limit)) };
  };
}

// DB가 돌려주는 원본 제출건 3건 (가상)
const RAW = [
  { total_score: 25, client_gender: "여", client_birth: "1945-02-04", survey_date: "2026-09-03", status: "확인 완료", checklist_type: "fall", institution_code: "A1", institutions: { name: "기관A", sido: "부산", sigungu: "서구" }, submission_answers: [{ question_no: 1, answer_label: "예" }, { question_no: 2, answer_label: "아니오" }] },
  { total_score: 40, client_gender: "남", client_birth: "1940-01-01", survey_date: "2026-09-03", status: "확인 대기", checklist_type: "fall", institution_code: "A1", institutions: { name: "기관A", sido: "부산", sigungu: "서구" }, submission_answers: [{ question_no: 1, answer_label: "예" }, { question_no: 2, answer_label: "예" }] },
  { total_score: null, client_gender: "여", client_birth: "이상값", survey_date: "2026-08-15", status: "확인 완료", checklist_type: "fall", institution_code: "B2", institutions: { name: "기관B", sido: "서울", sigungu: "강남" }, submission_answers: [{ question_no: 1, answer_label: "아니오" }] },
];

test("normalizeSubmissions — 제출건을 record 로 변환", () => {
  const recs = normalizeSubmissions(RAW);
  assert.equal(recs.length, 3);
  assert.deepEqual(
    { score: recs[0].score, age: recs[0].age, gender: recs[0].gender, month: recs[0].month, inst: recs[0].institution },
    { score: 25, age: 81, gender: "여", month: "2026-09", inst: "A1" }
  );
  assert.deepEqual(recs[0].answers, { 1: "예", 2: "아니오" });
  assert.equal(recs[2].score, null); // 점수 없음
  assert.equal(recs[2].age, null); // 생년월일 이상값 → 나이 없음
});

test("ageFromBirth — 범위 밖 나이는 제외", () => {
  assert.equal(ageFromBirth("1945-02-04", "2026-09-03"), 81);
  assert.equal(ageFromBirth("이상값", "2026"), null);
  assert.equal(ageFromBirth("1997-01-01", "2026-01-01"), null); // 29세 → 제외
  assert.equal(ageFromBirth("1800-01-01", "2026-01-01"), null); // 226세 → 제외
});

test("median — 중앙값", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([5, 10]), 7.5);
  assert.equal(median([1, 2, 3]), 2);
});

test("summarize — 요약 숫자", () => {
  const s = summarize(normalizeSubmissions(RAW));
  assert.equal(s.n, 3);
  assert.equal(s.withScore, 2);
  assert.equal(s.meanScore, 32.5);
  assert.equal(s.medianScore, 32.5);
  assert.equal(s.institutionCount, 2);
  assert.equal(s.ageKnown, 2);
  assert.deepEqual(s.statusCounts, { "확인 완료": 2, "확인 대기": 1 });
});

// STEP 2 의 분석 기준 추천이 "이 기준이 이 데이터에 쓸모 있는지" 판단할 때 쓰는 값
test("summarize — 성별 기록 건수와 조사 월 수", () => {
  const s = summarize(normalizeSubmissions(RAW));
  assert.equal(s.genderKnown, 3);
  assert.equal(s.monthCount, 2); // 2026-09, 2026-08

  const noGender = summarize(normalizeSubmissions(RAW.map((row) => ({ ...row, client_gender: "" }))));
  assert.equal(noGender.genderKnown, 0);

  const oneMonth = summarize(normalizeSubmissions(RAW.map((row) => ({ ...row, survey_date: "2026-09-03" }))));
  assert.equal(oneMonth.monthCount, 1);

  assert.deepEqual(
    { genderKnown: summarize([]).genderKnown, monthCount: summarize([]).monthCount },
    { genderKnown: 0, monthCount: 0 }
  );
});

test("itemRates — 문항별 대표 응답률(높은 순)", () => {
  const rows = itemRates(normalizeSubmissions(RAW));
  assert.equal(rows.length, 2); // 문항 1, 2
  assert.equal(rows[0].questionNo, "1"); // 예 66.7% 로 더 높음
  assert.equal(rows[0].primaryLabel, "예");
  assert.equal(rows[0].primaryRate, 66.7);
  assert.equal(rows[1].questionNo, "2");
  assert.equal(rows[1].primaryRate, 50);
});

// 우울 척도처럼 보기가 빈도(없음 / 2~3일 이상 / 7일 이상 / 거의 매일)인 설문에서
// 가장 많은 응답이 "없음" 이어도 대표 응답은 위험 쪽 보기여야 한다.
test("itemRates — 빈도형 보기는 위험 쪽 응답을 대표로 삼는다", () => {
  const answer = (label) => ({ ...RAW[0], submission_answers: [{ question_no: 1, answer_label: label }] });
  const rows = itemRates(normalizeSubmissions([
    answer("없음"), answer("없음"), answer("없음"), answer("2~3일 이상"),
  ]));
  assert.equal(rows[0].primaryLabel, "2~3일 이상");
  assert.equal(rows[0].primaryRate, 25);

  // 더 심한 보기가 함께 있으면 그쪽이 대표가 된다.
  const worse = itemRates(normalizeSubmissions([answer("없음"), answer("2~3일 이상"), answer("거의 매일")]));
  assert.equal(worse[0].primaryLabel, "거의 매일");
});

test("POST /analysis/run — 조건으로 제출건을 읽어 교차 집계", async () => {
  let queriedUrl = "";
  global.fetch = pagedFetch(RAW, { onRequest: (u) => { if (u.includes("/rest/v1/submissions?")) queriedUrl = u; } });
  const result = await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    status: "all",
    specs: [{ row: { kind: "attribute", field: "status" }, col: { kind: "number_bins", field: "score", boundaries: [30] }, cells: ["count"] }],
  }));
  assert.equal(result.statusCode, 200);
  const p = JSON.parse(result.body);
  assert.equal(p.recordCount, 3);
  assert.equal(p.summary.meanScore, 32.5);
  assert.equal(p.tables.length, 1);
  assert.deepEqual(p.tables[0].rowLabels, ["확인 대기", "확인 완료"]);
  assert.deepEqual(p.tables[0].colLabels, ["29점 이하", "30점 이상"]);
  assert.equal(p.tables[0].droppedRecords, 1); // 점수 없는 1건
  assert.match(queriedUrl, /checklist_type=eq\.fall/);
  assert.match(queriedUrl, /deleted_at=is\.null/);
});

test("POST /analysis/run — '확인 완료 건만' 필터가 쿼리에 반영", async () => {
  let queriedUrl = "";
  global.fetch = pagedFetch(RAW.filter((r) => r.status === "확인 완료"), { onRequest: (u) => { queriedUrl = u; } });
  const result = await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    status: "completed",
    specs: [{ row: { kind: "all" }, col: { kind: "all" }, cells: ["count"] }],
  }));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).statusMode, "completed");
  assert.match(decodeURIComponent(queriedUrl), /status=eq\.확인 완료/);
});

test("POST /analysis/run — 시도/기간/기관 필터가 쿼리에 반영", async () => {
  let queriedUrl = "";
  global.fetch = async (url) => {
    queriedUrl = String(url);
    return { ok: true, status: 200, text: async () => "[]" };
  };
  await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    sido: "부산",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    agencyCode: "A1",
    specs: [{ row: { kind: "all" }, col: { kind: "all" } }],
  }));
  const u = decodeURIComponent(queriedUrl);
  assert.match(u, /institutions!inner/);
  assert.match(u, /institutions\.sido=eq\.부산/);
  assert.match(u, /survey_date=gte\.2026-09-01/);
  assert.match(u, /survey_date=lte\.2026-09-30/);
  assert.match(u, /institution_code=eq\.A1/);
});

test("POST /analysis/run — 잘못된 요청은 400/403", async () => {
  global.fetch = async () => ({ ok: true, status: 200, text: async () => "[]" });
  const noSpec = await handler(event("POST", "/analysis/run", token(), { checklistType: "fall", specs: [] }));
  assert.equal(noSpec.statusCode, 400);
  const noSurvey = await handler(event("POST", "/analysis/run", token(), { specs: [{ row: { kind: "all" }, col: { kind: "all" } }] }));
  assert.equal(noSurvey.statusCode, 400);
  const notAdmin = await handler(event("POST", "/analysis/run", token({ scope: "intake" }), { checklistType: "fall", specs: [{ row: { kind: "all" }, col: { kind: "all" } }] }));
  assert.equal(notAdmin.statusCode, 403);
});

// ── 1,000행 상한 대응 ─────────────────────────────────────────────────────────
function manyRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    ...RAW[0], id: `row-${i}`, status: i % 4 === 0 ? "확인 대기" : "확인 완료", total_score: i % 70,
    submission_answers: [{ question_no: 1, answer_label: i % 2 ? "예" : "아니오" }],
  }));
}

test("POST /analysis/run — Supabase 가 한 번에 1,000행만 줘도 2,500건을 빠짐없이 읽는다", async () => {
  const rows = manyRows(2500);
  const pages = [];
  global.fetch = pagedFetch(rows, { maxRows: 1000, onRequest: (u, o) => { if (o.method !== "HEAD" && u.includes("/submissions?")) pages.push(u); } });
  const result = await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    specs: [{ row: { kind: "attribute", field: "status" }, col: { kind: "all" }, cells: ["count"] }],
  }));
  assert.equal(result.statusCode, 200);
  const p = JSON.parse(result.body);
  assert.equal(p.recordCount, 2500); // 예전에는 limit=20000 한 번 요청 → 1,000건에서 조용히 잘렸다
  assert.equal(p.tables[0].grandTotal, 2500);
  assert.deepEqual(p.tables[0].rowTotals, [625, 1875]);
  assert.equal(pages.length, 3);
  assert.ok(pages.every((u) => /order=id\.asc/.test(u)), "페이지를 나눌 때 순서를 고정한다");
});

test("POST /analysis/run — 개수 헤더를 못 받아도 빈 페이지가 나올 때까지 읽는다", async () => {
  const rows = manyRows(1500);
  const inner = pagedFetch(rows, { maxRows: 1000 });
  global.fetch = async (url, options = {}) => {
    if (options.method === "HEAD") return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
    return inner(url, options);
  };
  const result = await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    specs: [{ row: { kind: "all" }, col: { kind: "all" }, cells: ["count"] }],
  }));
  assert.equal(JSON.parse(result.body).recordCount, 1500);
});

test("POST /analysis/run — 상한을 넘으면 틀린 숫자 대신 413 으로 멈춘다", async () => {
  let listRequests = 0;
  global.fetch = async (url, options = {}) => {
    if (options.method === "HEAD") return { ok: true, status: 200, headers: { get: () => "0-0/25000" }, text: async () => "" };
    listRequests += 1;
    return { ok: true, status: 200, text: async () => "[]" };
  };
  const result = await handler(event("POST", "/analysis/run", token(), {
    checklistType: "fall",
    specs: [{ row: { kind: "all" }, col: { kind: "all" } }],
  }));
  assert.equal(result.statusCode, 413);
  assert.match(JSON.parse(result.body).message, /25,000건/);
  assert.equal(listRequests, 0, "개수만 보고 바로 멈춘다 (2만 건을 다 읽고 나서 실패하지 않는다)");
});

// ── 자체 설문 응답 (선택형 · 복수 선택 · '기타' 입력 · 서술형) ─────────────────────
test("normalizeSubmissions — 자체 설문은 보기 이름으로만 읽고 입력 내용·서술형은 버린다", () => {
  const [rec] = normalizeSubmissions([{
    ...RAW[0],
    checklist_type: null,
    template_id: "11111111-1111-4111-8111-111111111111",
    submission_answers: [
      { question_no: 1, answer_label: "보통", answer_value: { optionIds: [1], labels: ["보통"], optionTexts: {} } },
      { question_no: 2, answer_label: "욕실, 계단", answer_value: { optionIds: [3, 4], labels: ["욕실", "계단"], optionTexts: {} } },
      { question_no: 3, answer_label: "기타: 옆집 김○○ 할머니 댁", answer_value: { optionIds: [9], labels: ["기타"], optionTexts: { 9: "옆집 김○○ 할머니 댁" } } },
      { question_no: 4, answer_label: "현관 계단이 미끄러움", answer_value: { text: "현관 계단이 미끄러움" } },
      { question_no: 5, answer_label: null, answer_value: { optionIds: [], labels: [], optionTexts: {} } },
    ],
  }]);
  assert.deepEqual(rec.answers, { 1: "보통", 2: ["욕실", "계단"], 3: "기타" });
  assert.ok(!JSON.stringify(rec).includes("김○○"), "직접 입력한 내용이 집계 데이터에 남지 않는다");
  assert.ok(!JSON.stringify(rec).includes("미끄러움"), "서술형 답이 집계 데이터에 남지 않는다");
});

test("computeCrosstab — 복수 선택은 보기마다 세고, 합계와 비율은 응답자 기준이다", () => {
  const { computeCrosstab } = require("../netlify/functions/lib/crosstab.js");
  const person = (gender, places) => ({ score: 10, gender, answers: { 2: places } });
  const records = [
    person("여", ["욕실", "계단"]),
    person("여", "욕실"),
    person("남", ["욕실", "계단", "현관"]),
    person("남", "현관"),
    { score: 5, gender: "남", answers: {} }, // 이 문항에 응답 없음
  ];
  const t = computeCrosstab(records, { row: { kind: "attribute", field: "gender" }, col: { kind: "question", questionNo: "2" }, cells: ["count", "pct"] });
  assert.equal(t.colMulti, true);
  assert.equal(t.rowMulti, false);
  const cell = (row, col) => t.cells[t.rowLabels.indexOf(row)][t.colLabels.indexOf(col)];
  assert.equal(cell("여", "욕실").count, 2);
  assert.equal(cell("여", "욕실").pct, 100); // 여성 응답자 2명 중 2명
  assert.equal(cell("여", "계단").pct, 50);
  assert.equal(cell("남", "현관").pct, 100);
  assert.equal(t.rowTotals[t.rowLabels.indexOf("여")], 2); // 여성 응답자 수 (선택 합 3 이 아니다)
  assert.equal(t.rowTotals[t.rowLabels.indexOf("남")], 2);
  assert.equal(t.grandTotal, 4); // 응답자 수 (선택 합 6 이 아니다)
  assert.equal(t.droppedRecords, 1);
  assert.equal(t.grandTotal + t.droppedRecords, records.length);
  assert.equal(t.colTotals[t.colLabels.indexOf("욕실")], 3); // 욕실을 고른 사람 수
  const womenPctSum = t.colLabels.reduce((sum, col) => sum + cell("여", col).pct, 0);
  assert.equal(womenPctSum, 150, "복수 선택 열이면 한 행의 비율 합이 100% 를 넘는다");
});

test("computeCrosstab — 단일 선택만 있으면 예전과 똑같이 합계 = 칸의 합", () => {
  const { computeCrosstab } = require("../netlify/functions/lib/crosstab.js");
  const t = computeCrosstab(normalizeSubmissions(RAW), { row: { kind: "attribute", field: "gender" }, col: { kind: "question", questionNo: "1" }, cells: ["count", "pct"] });
  assert.equal(t.rowMulti, false);
  assert.equal(t.colMulti, false);
  const cellSum = t.cells.flat().reduce((sum, c) => sum + c.count, 0);
  assert.equal(cellSum, t.grandTotal);
  t.cells.forEach((row, ri) => { if (t.rowTotals[ri]) assert.equal(row.reduce((s, c) => s + c.pct, 0), 100); });
});

test("itemRates — 복수 선택 비율은 응답자 대비, 자체 설문 대표 응답은 배점 가장 높은 보기", () => {
  const { primaryLabelsFromTemplate } = require("../netlify/functions/lib/analysis.js");
  const records = [
    { answers: { 1: "양호", 2: ["욕실", "계단"] } },
    { answers: { 1: "양호", 2: "욕실" } },
    { answers: { 1: "불량", 2: ["계단", "현관"] } },
    { answers: { 1: "양호" } },
  ];
  const template = {
    scoringEnabled: true,
    questions: [
      { questionNo: 1, answerType: "single_choice", options: [{ optionText: "양호", score: 0 }, { optionText: "보통", score: 1 }, { optionText: "불량", score: 2 }] },
      { questionNo: 2, answerType: "multiple_choice", options: [{ optionText: "욕실", score: 1 }, { optionText: "계단", score: 3 }, { optionText: "현관", score: 1 }] },
      { questionNo: 3, answerType: "text", options: [] },
    ],
  };
  const primary = primaryLabelsFromTemplate(template);
  assert.deepEqual(primary, { 1: "불량", 2: "계단" });
  const rates = itemRates(records, { primaryByQuestion: primary, builtinOrder: false });
  const q1 = rates.find((r) => r.questionNo === "1");
  const q2 = rates.find((r) => r.questionNo === "2");
  assert.equal(q1.primaryLabel, "불량"); // 가장 많은 '양호'가 아니라 위험 쪽
  assert.equal(q1.primaryRate, 25);
  assert.equal(q2.multi, true);
  assert.equal(q2.total, 3); // 이 문항에 응답한 사람 수
  assert.equal(q2.primaryLabel, "계단");
  assert.equal(q2.primaryRate, 66.7); // 3명 중 2명
  assert.deepEqual(primaryLabelsFromTemplate({ ...template, scoringEnabled: false }), {});
});
