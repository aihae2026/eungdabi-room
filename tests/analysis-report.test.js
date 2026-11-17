const {accountResponse}=require('./support/account-ai-fixture');
// STEP 4 결과 분석 — 참고자료 읽기 · AI 요청 · AI 답 검사 · 키가 없을 때의 동작
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.NETLIFY_AUTH_SECRET = "test-auth-secret";

const { handler } = require("../netlify/functions/api-legacy.cjs");
const docs = require("../netlify/functions/lib/reference-docs.js");
const report = require("../netlify/functions/lib/analysis-report.js");

function token(payload) {
  const encoded = Buffer.from(
    JSON.stringify({ scope: "admin", agencyCode: "AG1", role: "agency", exp: Math.floor(Date.now() / 1000) + 3600, ...payload })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.NETLIFY_AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function event(method, path, authToken, body) {
  return { httpMethod: method, rawUrl: `http://localhost/api${path}`, headers: { authorization: `Bearer ${authToken}` }, body: body === undefined ? null : JSON.stringify(body) };
}

// ── 테스트용 파일 만들기 ──────────────────────────────────────────────────────
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const method = entry.method ?? 8;
    const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const size = entry.declaredSize ?? raw.length;
    const flags = entry.flags ?? 0x0800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const DOCX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>2026년 낙상 예방 사업 지침</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">대상: 만 65세 이상 &amp; 고위험군</w:t></w:r><w:r><w:tab/><w:t>(필수)</w:t></w:r></w:p>
<w:tbl><w:tblPr/><w:tr><w:trPr/><w:tc><w:tcPr/><w:p><w:r><w:t>구분</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>기준</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>고위험</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>60점 이상</w:t></w:r></w:p><w:p><w:r><w:t>연 2회 방문</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>담당자 연락처 010-1234-5678</w:t></w:r></w:p>
</w:body></w:document>`;
const makeDocx = (xml = DOCX_XML) => makeZip([{ name: "[Content_Types].xml", data: "<Types/>" }, { name: "word/document.xml", data: xml }]);

const HWPX_SECTION = (text) => `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
<hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>
<hp:p><hp:run><hp:ctrl><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>항목</hp:t></hp:run></hp:p></hp:subList></hp:tc><hp:tc><hp:subList><hp:p><hp:run><hp:t>비율<hp:lineBreak/>(%)</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:ctrl></hp:run></hp:p>
</hs:sec>`;
const makeHwpx = () => makeZip([
  { name: "mimetype", data: "application/hwp+zip", method: 0 },
  { name: "Contents/section1.xml", data: HWPX_SECTION("둘째 구역") },
  { name: "Contents/section0.xml", data: HWPX_SECTION("첫째 구역") },
]);

function makePdf(content, { flate = true, encrypt = false } = {}) {
  const stream = flate ? zlib.deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const head = [
    "%PDF-1.4\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n`,
  ].join("");
  const tail = `\nendstream\nendobj\ntrailer\n<< /Root 1 0 R${encrypt ? " /Encrypt 5 0 R" : ""} >>\n%%EOF\n`;
  return Buffer.concat([Buffer.from(head, "latin1"), stream, Buffer.from(tail, "latin1")]);
}
const TEXT_PDF = () => makePdf("BT /F1 12 Tf 72 720 Td (Guideline) Tj ET");
const b64 = (buffer) => buffer.toString("base64");

// ── 참고자료 읽기 ─────────────────────────────────────────────────────────────
test("DOCX — 문단·표를 셀 단위로 살려 글자로 풀고, 탭 위치 정의는 글자로 넣지 않는다", () => {
  const text = docs.extractDocxText(makeDocx());
  const lines = text.split("\n");
  assert.equal(lines[0], "2026년 낙상 예방 사업 지침");
  assert.equal(lines[1], "대상: 만 65세 이상 & 고위험군 (필수)");
  assert.equal(lines[2], "| 구분 | 기준 |");
  assert.equal(lines[3], "| 고위험 | 60점 이상 / 연 2회 방문 |");
  assert.match(text, /010-1234-5678/); // 가리기는 normalizeReferenceFiles 단계에서
});

test("HWPX — 구역 순서대로 읽고 표 안 줄바꿈까지 처리한다", () => {
  const text = docs.extractHwpxText(makeHwpx());
  assert.deepEqual(text.split("\n"), ["첫째 구역", "| 항목 | 비율 (%) |", "둘째 구역", "| 항목 | 비율 (%) |"]);
});

test("압축 폭탄 · 암호 · 손상 파일은 풀지 않는다", () => {
  const bomb = makeZip([{ name: "word/document.xml", data: "A".repeat(200000), declaredSize: 100 }]);
  assert.throws(() => docs.extractDocxText(bomb), /풀지 못했습니다/);
  const locked = makeZip([{ name: "word/document.xml", data: DOCX_XML, flags: 0x0801 }]);
  assert.throws(() => docs.extractDocxText(locked), /암호/);
  assert.throws(() => docs.extractDocxText(Buffer.from("PK not a real zip")), /압축 파일/);
});

test("PDF — 글자층이 있는지로 텍스트 PDF 와 스캔본을 가른다", () => {
  assert.equal(docs.pdfTextLayerStatus(TEXT_PDF()), "text");
  assert.equal(docs.pdfTextLayerStatus(makePdf("BT /F1 12 Tf [<0041> -120 <0042>] TJ ET")), "text");
  assert.equal(docs.pdfTextLayerStatus(makePdf("BT /F1 12 Tf (Plain) Tj ET", { flate: false })), "text");
  assert.equal(docs.pdfTextLayerStatus(makePdf("q 612 0 0 792 0 0 cm /Im0 Do Q")), "scanned");
  assert.equal(docs.pdfTextLayerStatus(makePdf("BT (x) Tj ET", { encrypt: true })), "encrypted");
  assert.equal(docs.pdfTextLayerStatus(Buffer.from("not a pdf")), "invalid");
});

test("참고자료 받기 — 형식별로 받거나 바꾸는 방법을 알려 준다", () => {
  const reject = (file) => { try { docs.normalizeReferenceFiles([file]); } catch (error) { return error; } assert.fail("거부해야 함"); };
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.match(reject({ filename: "캡처.png", fileBase64: b64(png) }).message, /이미지 파일은/);
  const hwp = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  assert.match(reject({ filename: "지침.hwp", fileBase64: b64(hwp) }).message, /구형 한글\(HWP\)/);
  assert.match(reject({ filename: "스캔.pdf", fileBase64: b64(makePdf("q /Im0 Do Q")) }).message, /^스캔\.pdf: 스캔한 PDF/, "여러 개를 올려도 어느 파일인지 알 수 있게 파일 이름을 붙인다");
  assert.match(reject({ filename: "잠김.pdf", fileBase64: b64(makePdf("BT (x) Tj ET", { encrypt: true })) }).message, /암호가 걸린 PDF/);
  assert.match(reject({ filename: "메모.txt", fileBase64: b64(Buffer.from("hello")) }).message, /텍스트 PDF · DOCX · HWPX/);
  assert.match(reject({ filename: "가짜.docx", fileBase64: b64(Buffer.from("not zip")) }).message, /DOCX 형식이 아닙니다/);

  const tooMany = Array.from({ length: 6 }, (_, i) => ({ filename: `${i}.pdf`, fileBase64: b64(TEXT_PDF()) }));
  assert.throws(() => docs.normalizeReferenceFiles(tooMany), /최대 5개/);

  const { files, warnings } = docs.normalizeReferenceFiles([
    { filename: "지침.docx", fileBase64: b64(makeDocx()) },
    { filename: "보고서.hwpx", fileBase64: b64(makeHwpx()) },
    { filename: "작년결과.pdf", fileBase64: b64(TEXT_PDF()) },
  ]);
  assert.deepEqual(files.map((f) => f.kind), ["docx", "hwpx", "pdf"]);
  assert.match(files[0].text, /\[휴대전화번호 가림\]/);
  assert.doesNotMatch(files[0].text, /010-1234-5678/);
  assert.match(warnings.join(" "), /참고자료 1\(지침\.docx\)에서 휴대전화번호 1건을 가린 뒤/);
  assert.deepEqual(docs.normalizeReferenceFiles(undefined).files, [], "참고자료는 선택사항");
});

test("참고자료 글자 한도 — 넘친 만큼 알리고, 한 글자도 못 쓴 참고자료는 AI 에 빈 내용으로 보내지 않는다", () => {
  const longXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${"가".repeat(60010)}</w:t></w:r></w:p></w:body></w:document>`;
  const { files, warnings } = docs.normalizeReferenceFiles([
    { filename: "긴지침.docx", fileBase64: b64(makeDocx(longXml)) },
    { filename: "보고서.hwpx", fileBase64: b64(makeHwpx()) },
    { filename: "작년결과.pdf", fileBase64: b64(TEXT_PDF()) },
  ]);
  assert.equal(files[0].text.length, 60000);
  assert.equal(files[1].text, "");
  assert.match(warnings.join(" "), /참고자료 1\(긴지침\.docx\)의 글자가 많아 앞부분만/);
  assert.match(warnings.join(" "), /참고자료 2\(보고서\.hwpx\): 앞선 참고자료의 글자가 많아 분석에 쓰지 못했습니다/);

  const texts = report.buildReportRequest({ model: "m", context: CONTEXT(), references: files }).input[0].content.map((part) => part.text || "");
  assert.ok(texts.some((text) => text.startsWith("[참고자료 1]")));
  assert.equal(texts.some((text) => text.startsWith("[참고자료 2]")), false);
  assert.ok(texts.some((text) => text.startsWith("[참고자료 3]")), "뒤 참고자료의 번호는 화면 목록과 같게 유지한다");
});

test("개인정보 형태 — 휴대전화·주민번호만 가리고 기관 대표번호·날짜·이메일은 두다", () => {
  const { text, found } = docs.maskPersonalInfo("문의 02-123-4567, 담당 010.9876.5432, 01011112222, 주민 900101-1234567, 조사일 2026-09-14, help@korea.kr");
  assert.equal(found["휴대전화번호"], 2);
  assert.equal(found["주민등록번호"], 1);
  assert.match(text, /02-123-4567/);
  assert.match(text, /2026-09-14/);
  assert.match(text, /help@korea\.kr/);
  assert.doesNotMatch(text, /9876|1111|1234567/);
});

// ── AI 입력 만들기 ────────────────────────────────────────────────────────────
const TABLE = {
  spec: { row: { kind: "attribute", field: "institution" }, col: { kind: "number_bins", field: "score", boundaries: [26, 60] }, cells: ["count", "pct"] },
  rowLabels: ["AG1", "AG2"],
  colLabels: ["25점 이하", "26–59점", "60점 이상"],
  cells: [[{ count: 12, pct: 40 }, { count: 15, pct: 50 }, { count: 3, pct: 10 }], [{ count: 5, pct: 25 }, { count: 9, pct: 45 }, { count: 6, pct: 30 }]],
  rowTotals: [30, 20], colTotals: [17, 24, 9], grandTotal: 50, droppedRecords: 2, rowMulti: false, colMulti: false,
};
const CONTEXT = () => report.buildReportContext({
  surveyTitle: "주거환경 점검",
  questions: [{ questionNo: 3, questionText: "야간 조명은 충분한가요?" }],
  filters: { startDate: "2026-08-01", endDate: "2026-09-30" },
  statusMode: "all",
  recordCount: 52,
  summary: { n: 52, withScore: 50, meanScore: 33.4, medianScore: 31, minScore: 2, maxScore: 88, institutionCount: 2, statusCounts: { "확인 완료": 30, "확인 대기": 22 } },
  itemRates: [{ questionNo: "3", primaryLabel: "부족함", primaryRate: 32.9, total: 49, multi: false }],
  tables: [TABLE],
  institutionNames: { AG1: "가상기관 1", AG2: "가상기관 2" },
});

test("AI 입력 — 집계 숫자·표 이름·문항 문장만 담고 기관코드는 이름으로 바꾼다", () => {
  const context = CONTEXT();
  assert.equal(context.조사_개요.기간, "2026-08-01 ~ 2026-09-30");
  assert.deepEqual(context.표[0].행.map((row) => row.이름), ["가상기관 1", "가상기관 2"]);
  assert.equal(context.표[0].행[0].칸[2].인원, 3);
  assert.equal(context.문항별_대표_응답[0].문장, "야간 조명은 충분한가요?");
  const allowed = report.allowedNumbers(context);
  for (const value of ["12", "40", "33.4", "33", "26", "59", "60", "2026", "9", "52", "32.9", "3", "1"]) assert.ok(allowed.has(value), `${value} 은 인용 가능`);
  assert.equal(allowed.has("77"), false);
});

test("AI 입력 — 기관 범위: 조건으로 고른 기관·지역 > 수행기관 계정의 본인 기관 이름 > 권한 범위 전체", () => {
  const scope = (overrides) => report.buildReportContext({ surveyTitle: "주거환경 점검", recordCount: 1, institutionNames: { AG1: "가상기관 1" }, ...overrides }).조사_개요.기관_범위;
  assert.equal(scope({}), "권한 범위의 전체 기관");
  assert.equal(scope({ scopeName: "가상기관 1" }), "가상기관 1");
  assert.equal(scope({ scopeName: "가상기관 1", filters: { sido: "가상특별시" } }), "가상특별시");
  assert.equal(scope({ filters: { agencyCode: "AG1" } }), "가상기관 1");
});

test("AI 요청 — 참고자료가 없으면 통계만, 있으면 PDF 는 파일로 · DOCX/HWPX 는 글자로 보낸다", () => {
  const context = CONTEXT();
  const statsOnly = report.buildReportRequest({ model: "m", context, references: [] });
  assert.equal(statsOnly.input[0].content.some((part) => part.type === "input_file"), false);
  assert.match(statsOnly.instructions, /참고자료가 없습니다/);
  assert.match(statsOnly.instructions, /참고자료_근거는 모든 항목에서 null/);
  assert.equal(statsOnly.text.format.type, "json_object");

  const { files } = docs.normalizeReferenceFiles([
    { filename: "홍길동_상담기록.pdf", fileBase64: b64(TEXT_PDF()) },
    { filename: "지침.docx", fileBase64: b64(makeDocx()) },
  ]);
  const withRefs = report.buildReportRequest({ model: "m", context, references: files });
  const parts = withRefs.input[0].content;
  const pdfPart = parts.find((part) => part.type === "input_file");
  assert.equal(pdfPart.filename, "reference-1.pdf");
  assert.match(pdfPart.file_data, /^data:application\/pdf;base64,/);
  assert.ok(parts.some((part) => part.type === "input_text" && /2026년 낙상 예방 사업 지침/.test(part.text)));
  const serialized = JSON.stringify(withRefs);
  assert.doesNotMatch(serialized, /홍길동/, "사용자 파일명은 AI 에 보내지 않는다");
  assert.doesNotMatch(serialized, /010-1234-5678/, "가린 개인정보는 AI 로 나가지 않는다");
  assert.match(withRefs.instructions, /명시된 내용만 근거로/);
});

// ── AI 답 검사 ────────────────────────────────────────────────────────────────
const ITEM = (overrides = {}) => ({
  분석_결과: "가상기관 2의 60점 이상 비율이 30%로 더 높습니다.",
  사용한_통계값: ["표 1 · 기관 × 총점 구간: 가상기관 2 60점 이상 6명 (30%)"],
  참고자료_근거: null,
  해석: "기관별로 고위험 비율 차이가 있어 방문 우선순위 참고가 가능합니다.",
  주의사항: "기관 간 이용자 구성 차이일 수 있습니다.",
  근거_충분도: "부분적",
  ...overrides,
});

test("AI 답 검사 — 정상 항목은 그대로, 개요는 서버가 만든다", () => {
  const { report: out, warnings } = report.validateAnalysisReport({ 조사_개요: { 설문: "AI가 지어낸 개요" }, 분석_항목: [ITEM()] }, { context: CONTEXT(), hasReferences: false });
  assert.equal(out.조사_개요.설문, "주거환경 점검");
  assert.equal(out.분석_항목[0].근거_충분도, "부분적");
  assert.equal(out.분석_항목[0].검증, undefined);
  assert.deepEqual(warnings, []);
});

test("AI 답 검사 — 통계 결과에 없는 수치를 인용하면 판단 보류로 내린다", () => {
  const { report: out } = report.validateAnalysisReport({ 분석_항목: [ITEM({ 사용한_통계값: ["가상기관 2 60점 이상 77명 (38.5%)"], 근거_충분도: "충분" })] }, { context: CONTEXT(), hasReferences: false });
  const item = out.분석_항목[0];
  assert.equal(item.근거_충분도, "불충분");
  assert.deepEqual(item.검증.찾지_못한_수치.sort(), ["38.5", "77"]);
  assert.equal(item.검증.원래_근거_충분도, "충분");
});

test("AI 답 검사 — 참고자료 없이 요청했는데 근거를 적어 오면 지우고 알린다", () => {
  const raw = { 분석_항목: [ITEM({ 참고자료_근거: "사업 지침 제3조에 따르면 …" })] };
  const statsOnly = report.validateAnalysisReport(raw, { context: CONTEXT(), hasReferences: false });
  assert.equal(statsOnly.report.분석_항목[0].참고자료_근거, null);
  assert.match(statsOnly.warnings.join(" "), /참고자료 없이 요청했는데/);
  const withRefs = report.validateAnalysisReport(raw, { context: CONTEXT(), hasReferences: true });
  assert.match(withRefs.report.분석_항목[0].참고자료_근거, /제3조/);
});

test("AI 답 검사 — 값이 틀리거나 필수 내용이 빠진 항목, 개인정보 형태를 처리한다", () => {
  const { report: out, warnings } = report.validateAnalysisReport({
    분석_항목: [
      ITEM({ 근거_충분도: "매우 충분" }),
      ITEM({ 해석: "" }),
      ITEM({ 사용한_통계값: "표 1 · 가상기관 1 25점 이하 12명 (40%)", 주의사항: "담당자 010-2222-3333 에게 문의" }),
    ],
  }, { context: CONTEXT(), hasReferences: false });
  assert.equal(out.분석_항목.length, 2);
  assert.equal(out.분석_항목[0].근거_충분도, "불충분");
  assert.deepEqual(out.분석_항목[1].사용한_통계값, ["표 1 · 가상기관 1 25점 이하 12명 (40%)"]);
  assert.match(out.분석_항목[1].주의사항, /\[휴대전화번호 가림\]/);
  const text = warnings.join(" ");
  assert.match(text, /올바르지 않아 '불충분'/);
  assert.match(text, /필수 내용/);
  assert.match(text, /휴대전화번호 1건 형태를 가렸습니다/);
  assert.throws(() => report.validateAnalysisReport({ 분석_항목: [ITEM({ 해석: "" })] }, { context: CONTEXT(), hasReferences: false }), /사용할 수 있는 분석 항목이 없습니다/);
  assert.throws(() => report.validateAnalysisReport({ 분석_항목: [] }, { context: CONTEXT(), hasReferences: false }), /분석 항목이 없습니다/);
});

test("AI 요청 → 답 검사까지 한 번에 (가짜 AI)", async () => {
  const context = CONTEXT();
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ blocked: false, 분석_항목: [ITEM()] }) }] }] }) };
  };
  const raw = await report.requestAnalysisReport({
    credential: { provider:"openai", model:"gpt-5.4-mini", apiKey: "agency-key" },
    body: report.buildReportRequest({ model: "gpt-test", context, references: [] }),
    fetchImpl: fakeFetch,
  });
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].headers.Authorization, "Bearer agency-key");
  assert.equal(calls[0].body.model, "gpt-5.4-mini");
  const { report: out } = report.validateAnalysisReport(raw, { context, hasReferences: false });
  assert.equal(out.분석_항목.length, 1);

  const failing = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Incorrect API key provided: sk-abc***" } }) });
  await assert.rejects(
    report.requestAnalysisReport({ credential: { provider:"openai", model:"gpt-5.4-mini", apiKey: "bad" }, body: {}, fetchImpl: failing }),
    (error) => error.statusCode === 401 && !/sk-abc/.test(error.message),
    "제공사 오류 문구(키 일부 등)를 그대로 내보내지 않는다"
  );
  await assert.rejects(report.requestAnalysisReport({ credential: null, body: {}, fetchImpl: failing }), (error) => error.statusCode === 412);
});

// ── 서버 경로 ─────────────────────────────────────────────────────────────────
test("결과 분석 상태 — 기관 키가 없으면 사용할 수 없다고 알린다 (키 원문은 절대 없음)", async () => {
  global.fetch = async url => { const response=accountResponse(url); if(response)return response; throw new Error("AI 외부 요청은 없어야 한다"); };
  const result = await handler(event("GET", "/analysis/report/status", token()));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.deepEqual({ available: body.available, reason: body.reason }, { available: false, reason: "AI_KEY_NOT_CONFIGURED" });
  const intake = await handler(event("GET", "/analysis/report/status", token({ scope: "intake" })));
  assert.equal(intake.statusCode, 403);
});

test("결과 분석 요청 — 키가 없으면 통계를 읽지도, AI 를 부르지도 않고, 공용 키로 대신하지 않는다", async () => {
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = "project-wide-key";
  process.env.OPENAI_BASE_URL = "https://project-gateway.example.test";
  process.env.NETLIFY_AI_GATEWAY_KEY = "project-gateway-key";
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://project-gateway.example.test";
  const requests = [];
  global.fetch = async (url) => { const response=accountResponse(url); if(response)return response; requests.push(String(url)); return { ok: true, status: 200, text: async () => "[]", json: async () => ({}) }; };
  try {
    const result = await handler(event("POST", "/analysis/report", token(), {
      checklistType: "fall",
      specs: [{ row: { kind: "all" }, col: { kind: "all" } }],
      files: [{ filename: "지침.docx", fileBase64: b64(makeDocx()) }],
    }));
    assert.equal(result.statusCode, 412);
    assert.match(JSON.parse(result.body).message, /미설정이거나 사용 중지/);
    assert.deepEqual(requests, [], "제출건 조회도 AI 요청도 없어야 한다");

    const badFile = await handler(event("POST", "/analysis/report", token(), {
      checklistType: "fall", specs: [{ row: { kind: "all" }, col: { kind: "all" } }],
      files: [{ filename: "캡처.png", fileBase64: b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0])) }],
    }));
    assert.equal(badFile.statusCode, 400, "잘못된 참고자료는 키 확인 전에 알린다");
  } finally {
    Object.keys(process.env).forEach((key) => { if (!(key in saved)) delete process.env[key]; });
    Object.assign(process.env, saved);
  }
});

test("결과 분석 요청은 스트리밍 경로로 감싸 오류도 JSON 줄로 전달한다", async () => {
  globalThis.Netlify = { env: { get: (name) => process.env[name] || "" } };
  global.fetch = async url => {const response=accountResponse(url);if(response)return response;throw Error("Unexpected external call");};
  try {
    const { default: modernHandler } = await import("../netlify/functions/api.mjs");
    const response = await modernHandler(new Request("https://example.test/api/analysis/report", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checklistType: "fall", specs: [{ row: { kind: "all" }, col: { kind: "all" } }] }),
    }));
    assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events[0].type, "started");
    const errorEvent = events.find((item) => item.type === "error");
    assert.equal(errorEvent.payload.statusCode, 412);
  } finally {
    delete globalThis.Netlify;
  }
});
