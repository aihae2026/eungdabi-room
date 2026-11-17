"use strict";

// STEP 4 결과 분석 (구조화 JSON).
//   ① buildReportContext  — AI 에 보낼 "통계 결과"를 서버가 만든다. 사람별 응답은 넣지 않는다.
//   ② buildReportRequest  — AI 요청 본문 (지금은 프로젝트가 쓰는 OpenAI Responses 형식)
//   ③ requestAnalysisReport — 기관 AI 키로 요청 (fetch 를 주입받아 테스트한다)
//   ④ validateAnalysisReport — AI 답을 믿지 않고 검사한다: 6개 필드 · 값 · 길이 · 인용 수치 대조 ·
//      참고자료 없이 요청했으면 참고자료 근거를 비움 · 휴대전화/주민번호 형태 가림

const { maskPersonalInfo } = require("./reference-docs.js");

const SUFFICIENCY = ["충분", "부분적", "불충분"];
const BUILTIN_SURVEY_TITLES = { fall: "낙상 체크리스트", depression: "우울 체크리스트", memory: "기억 체크리스트" };
// 기본 3종의 검증된 위험 구간 경계값 (집계 DB 함수 admin_submission_stats · 화면의 AN_RISK_BOUNDS 와 같은 값).
// 이 경계값과 다른 총점 구간(자체 설문의 3등분 · 사용자가 바꾼 경계값)은 위험 수준이 아니라 참고 구간이다.
const VALIDATED_SCORE_BOUNDS = { fall: [26, 60], depression: [5, 10, 20], memory: [6] };
const REFERENCE_BAND_NOTE = "참고 구간 · 점수 범위를 나눈 것이며 검증된 위험 기준 아님";

function isValidatedScoreBand(checklistType, dim) {
  const bounds = VALIDATED_SCORE_BOUNDS[checklistType];
  const actual = [...new Set((dim?.boundaries || []).map(Number))].sort((a, b) => a - b);
  return Boolean(bounds) && actual.length === bounds.length && actual.every((value, i) => value === bounds[i]);
}
const LIMITS = { items: 10, 분석_결과: 300, 해석: 900, 주의사항: 600, 참고자료_근거: 900, 통계값_개수: 8, 통계값_길이: 240 };
const TABLE_ROW_LIMIT = 60;
const TABLE_COL_LIMIT = 30;

function reportError(statusCode, message, code = "INVALID_REPORT") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

// ── ① 통계 결과 → AI 입력 ─────────────────────────────────────────────────────
// scopeName: 조건으로 기관·지역을 고르지 않았을 때의 기관 범위 이름 (기관담당자 계정은 본인 기관 이름)
function buildReportContext({ surveyTitle, questions = [], filters = {}, statusMode, recordCount, summary = {}, itemRates = [], tables = [], institutionNames = {}, scopeName = "" }) {
  const questionText = new Map(questions.map((question) => [String(question.questionNo), question.questionText]));
  const labelOf = (dim, label) => (dim && dim.kind === "attribute" && dim.field === "institution" && institutionNames[label] ? institutionNames[label] : label);
  const dimName = (dim) => {
    if (!dim) return "";
    if (dim.kind === "question") return `문항 ${dim.questionNo} 응답${questionText.get(String(dim.questionNo)) ? ` (${questionText.get(String(dim.questionNo))})` : ""}`;
    if (dim.kind === "number_bins") return dim.field === "age" ? "연령대" : isValidatedScoreBand(filters.checklistType, dim) ? "총점 구간" : `총점 구간 (${REFERENCE_BAND_NOTE})`;
    if (dim.kind === "attribute") return { gender: "성별", institution: "기관", sido: "시도", sigungu: "시군구", status: "처리 상태" }[dim.field] || dim.field;
    return { all: "전체", month: "조사 월" }[dim.kind] || dim.kind;
  };

  return {
    조사_개요: {
      설문: surveyTitle || "",
      기간: filters.startDate || filters.endDate ? `${filters.startDate || "처음"} ~ ${filters.endDate || "현재"}` : "전체 기간",
      기관_범위: filters.agencyCode ? labelOf({ kind: "attribute", field: "institution" }, filters.agencyCode) : filters.sigungu || filters.sido || scopeName || "권한 범위의 전체 기관",
      처리_상태: statusMode === "completed" ? "확인 완료 건만" : "전체 (확인 대기 + 확인 완료)",
      응답_수: recordCount ?? summary.n ?? 0,
    },
    요약: {
      응답_수: summary.n ?? 0,
      점수_있는_건: summary.withScore ?? 0,
      평균_총점: summary.meanScore ?? null,
      중앙값_총점: summary.medianScore ?? null,
      최저_총점: summary.minScore ?? null,
      최고_총점: summary.maxScore ?? null,
      기관_수: summary.institutionCount ?? 0,
      확인_완료: summary.statusCounts?.["확인 완료"] ?? 0,
      확인_대기: summary.statusCounts?.["확인 대기"] ?? 0,
    },
    표: tables.map((table, index) => {
      const rows = table.rowLabels.slice(0, TABLE_ROW_LIMIT);
      const cols = table.colLabels.slice(0, TABLE_COL_LIMIT);
      const multi = Boolean(table.rowMulti || table.colMulti);
      return {
        번호: index + 1,
        기준: `${dimName(table.spec?.row)} × ${dimName(table.spec?.col)}`,
        복수_선택: multi,
        비율_기준: "행의 응답자 대비 %",
        열: cols.map((label) => labelOf(table.spec?.col, label)),
        행: rows.map((label, ri) => ({
          이름: labelOf(table.spec?.row, label),
          응답자_수: table.rowTotals[ri],
          칸: cols.map((_, ci) => {
            const cell = table.cells[ri][ci];
            const out = { 인원: cell.count };
            if (cell.pct != null) out.비율 = cell.pct;
            if (cell.mean != null) out.평균_총점 = cell.mean;
            return out;
          }),
        })),
        열별_응답자_수: cols.map((_, ci) => table.colTotals[ci]),
        전체_응답자_수: table.grandTotal,
        제외된_건수: table.droppedRecords,
        잘림: table.rowLabels.length > TABLE_ROW_LIMIT || table.colLabels.length > TABLE_COL_LIMIT,
      };
    }),
    문항별_대표_응답: itemRates.slice(0, 15).map((rate) => ({
      문항: `문항 ${rate.questionNo}`,
      문장: questionText.get(String(rate.questionNo)) || "",
      대표_응답: rate.primaryLabel,
      비율: rate.primaryRate,
      응답자_수: rate.total,
      복수_선택: Boolean(rate.multi),
    })),
  };
}

// ── 인용해도 되는 수치 모음 ───────────────────────────────────────────────────
const NUMBER_IN_TEXT = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
function canonicalNumber(value) {
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : null;
}
function numbersInText(text) {
  return (String(text ?? "").match(NUMBER_IN_TEXT) || []).map(canonicalNumber).filter((value) => value !== null);
}
function allowedNumbers(context) {
  const allowed = new Set();
  const add = (value) => {
    const canonical = canonicalNumber(value);
    if (canonical === null) return;
    allowed.add(canonical);
    // 비율·평균은 소수 첫째 자리까지 저장돼 있어 AI 가 정수로 반올림해 인용하는 경우를 허용한다.
    allowed.add(String(Math.round(Number(canonical))));
  };
  const walk = (node) => {
    if (node === null || node === undefined) return;
    if (typeof node === "number") return add(node);
    if (typeof node === "string") return numbersInText(node).forEach((value) => allowed.add(value));
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(context);
  return allowed;
}

// ── ② AI 요청 ─────────────────────────────────────────────────────────────────
function reportInstructions(hasReferences, { referenceBands = false } = {}) {
  const common = [
    "당신은 공공 돌봄 분야 설문 결과를 해석하는 분석가입니다.",
    "입력의 [통계 결과] JSON 은 서버가 코드로 계산한 집계입니다. 이 수치만 사용하세요.",
    "사용한_통계값에는 [통계 결과]에 있는 수치를 그대로 인용하세요. 새로 계산하거나 합산·차이·반올림한 값을 만들지 마세요.",
    "인과관계를 단정하지 마세요. '때문이다', '원인이다' 대신 분포와 차이를 서술하세요.",
    "칸 인원이 5명 미만이면 특정인이 드러날 수 있고 표본이 작습니다. 그 칸을 결론의 근거로 쓰지 말고 주의사항에 표본이 작다고 적으세요.",
    "복수_선택 표의 비율은 행의 응답자 대비라 한 행의 합이 100%를 넘을 수 있습니다. 이를 비율의 합으로 해석하지 마세요.",
    "근거_충분도: 충분 = 표본이 충분하고 수치가 결론을 직접 뒷받침 / 부분적 = 방향은 보이나 표본이 작거나 일부만 뒷받침 / 불충분 = 결론을 내리기 어려움.",
    "분석_항목은 3개 이상 7개 이하로 작성하세요. 모든 문장은 한국어로 씁니다.",
    "개인을 식별할 수 있는 정보(이름·연락처·주민등록번호 등)는 절대 출력하지 마세요.",
  ];
  const withReferences = [
    "첨부된 참고자료(사업 지침·이전 결과 등)에 명시된 내용만 근거로 삼으세요. 참고자료에 없는 기준·법령·지침을 지어내지 마세요.",
    "참고자료_근거에는 참고자료의 해당 문장이나 조항을 짧게 인용하고 어느 참고자료인지 밝히세요. 관련 근거가 없으면 null 로 두세요.",
    "참고자료에 실제 사람의 개인정보가 기입되어 있으면 blocked 를 true 로, blockedReason 에 이유만 적고 분석_항목은 빈 배열로 두세요.",
  ];
  const statisticsOnly = [
    "이번 요청에는 참고자료가 없습니다. 통계 결과만으로 해석하세요.",
    "참고자료_근거는 모든 항목에서 null 로 두세요. 외부 기준·법령·지침을 끌어오지 마세요.",
    "근거_충분도는 통계 근거가 결론을 얼마나 뒷받침하는지로만 평가하세요. 참고자료가 없다는 이유만으로 낮추지 마세요.",
  ];
  const format = [
    "JSON 객체만 반환하세요.",
    '형식: {"blocked":false,"blockedReason":"","분석_항목":[{"분석_결과":"한 문장 결론","사용한_통계값":["표 1 · …: … 명 (…%)"],"참고자료_근거":null,"해석":"실무적 의미","주의사항":"한계","근거_충분도":"충분|부분적|불충분"}]}',
  ];
  const bands = referenceBands
    ? ["기준에 '참고 구간'이라고 적힌 총점 구간은 점수 범위를 나눈 것일 뿐 위험 수준이 아닙니다. 고위험·위험군 같은 말로 해석하지 마세요."]
    : [];
  return [...common, ...bands, ...(hasReferences ? withReferences : statisticsOnly), ...format].join("\n");
}

// references: normalizeReferenceFiles().files. 사용자 파일명은 AI 에 보내지 않는다(파일명에 이름이 있을 수 있다).
function buildReportRequest({ model, context, references = [] }) {
  const content = [];
  references.forEach((file, index) => {
    const title = `참고자료 ${index + 1}`;
    if (file.kind === "pdf") {
      content.push({ type: "input_text", text: `[${title}] (PDF, 아래 파일)` });
      content.push({ type: "input_file", filename: `reference-${index + 1}.pdf`, file_data: `data:application/pdf;base64,${file.buffer.toString("base64")}` });
    } else if (file.text) { // 글자 한도를 넘어 한 글자도 못 쓴 참고자료는 빈 내용으로 보내지 않는다 (번호는 그대로 둔다)
      content.push({ type: "input_text", text: `[${title}] (${file.kind.toUpperCase()}에서 추출한 글자)\n${file.text}` });
    }
  });
  content.push({ type: "input_text", text: `[통계 결과]\n${JSON.stringify(context)}\n\n지정한 JSON 객체 형식으로만 답하세요.` });
  return {
    model,
    instructions: reportInstructions(references.length > 0, { referenceBands: (context.표 || []).some((table) => String(table.기준).includes(REFERENCE_BAND_NOTE)) }),
    input: [{ role: "user", content }],
    text: { format: { type: "json_object" } },
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

// ── ③ 기관 AI 키로 요청 ───────────────────────────────────────────────────────
// STEP 4 결과 분석과 STEP 2 AI 추천이 함께 쓴다. task 는 오류 문구에만 쓴다.
async function requestAnalysisReport({ credential, body, fetchImpl = fetch, task = "결과 분석" }) {
  if (!credential?.apiKey) throw reportError(412, "이 계정의 AI API 키가 설정되지 않았습니다.", "AI_KEY_NOT_CONFIGURED");
  const {complete} = require('./account-ai');
  const data = await complete(credential,body,fetchImpl);
  const text = extractOutputText(data);
  if (!text) throw reportError(502, `AI가 ${task} 내용을 보내지 않았습니다. 다시 시도해 주세요.`, "AI_EMPTY");
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw reportError(502, "AI 응답을 JSON으로 읽지 못했습니다. 다시 시도해 주세요.", "AI_BAD_JSON");
  }
}

// ── ④ AI 답 검사 ──────────────────────────────────────────────────────────────
function cleanText(value, max) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function validateAnalysisReport(raw, { context, hasReferences }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw reportError(502, "AI 응답 형식이 올바르지 않습니다.");
  const sourceItems = raw["분석_항목"];
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) throw reportError(502, "AI 응답에 분석 항목이 없습니다. 다시 시도해 주세요.");

  const allowed = allowedNumbers(context);
  const warnings = [];
  const personal = {};
  const mask = (text) => {
    const result = maskPersonalInfo(text);
    Object.entries(result.found).forEach(([kind, count]) => { personal[kind] = (personal[kind] || 0) + count; });
    return result.text;
  };

  const items = [];
  sourceItems.slice(0, LIMITS.items).forEach((source, index) => {
    const n = index + 1;
    if (!source || typeof source !== "object") { warnings.push(`분석 항목 ${n}의 형식이 올바르지 않아 뺐습니다.`); return; }
    const result = mask(cleanText(source["분석_결과"], LIMITS.분석_결과));
    const interpretation = mask(cleanText(source["해석"], LIMITS.해석));
    const caution = mask(cleanText(source["주의사항"], LIMITS.주의사항));
    const statsSource = Array.isArray(source["사용한_통계값"]) ? source["사용한_통계값"] : source["사용한_통계값"] ? [source["사용한_통계값"]] : [];
    const stats = statsSource.map((value) => mask(cleanText(value, LIMITS.통계값_길이))).filter(Boolean).slice(0, LIMITS.통계값_개수);
    if (!result || !interpretation || !caution || !stats.length) {
      warnings.push(`분석 항목 ${n}에 필수 내용(분석 결과·사용한 통계값·해석·주의사항)이 빠져 뺐습니다.`);
      return;
    }

    let reference = source["참고자료_근거"] === null || source["참고자료_근거"] === undefined ? null : mask(cleanText(source["참고자료_근거"], LIMITS.참고자료_근거)) || null;
    if (!hasReferences && reference) {
      reference = null;
      warnings.push(`분석 항목 ${n}: 참고자료 없이 요청했는데 참고자료 근거가 적혀 있어 지웠습니다.`);
    }

    let sufficiency = SUFFICIENCY.includes(source["근거_충분도"]) ? source["근거_충분도"] : null;
    if (!sufficiency) {
      warnings.push(`분석 항목 ${n}의 근거 충분도 값이 올바르지 않아 '불충분'으로 표시했습니다.`);
      sufficiency = "불충분";
    }

    const item = { 분석_결과: result, 사용한_통계값: stats, 참고자료_근거: reference, 해석: interpretation, 주의사항: caution, 근거_충분도: sufficiency };
    // 인용한 수치가 통계 결과에 실제로 있는지 대조한다. 없는 수치가 있으면 판단 보류로 내린다.
    const missing = [...new Set([...stats, result].flatMap(numbersInText).filter((value) => !allowed.has(value)))];
    if (missing.length) {
      item.검증 = { 상태: "수치 확인 필요", 찾지_못한_수치: missing.slice(0, 10), 원래_근거_충분도: sufficiency };
      item.근거_충분도 = "불충분";
    }
    items.push(item);
  });

  if (!items.length) throw reportError(502, "AI 응답에 사용할 수 있는 분석 항목이 없습니다. 다시 시도해 주세요.");
  if (sourceItems.length > LIMITS.items) warnings.push(`분석 항목이 많아 앞의 ${LIMITS.items}개만 사용했습니다.`);
  const personalKinds = Object.entries(personal).map(([kind, count]) => `${kind} ${count}건`);
  if (personalKinds.length) warnings.push(`AI 응답에서 ${personalKinds.join(", ")} 형태를 가렸습니다.`);

  return {
    report: {
      조사_개요: context.조사_개요, // AI 가 쓴 개요는 쓰지 않는다. 서버가 조건으로 만든다.
      분석_항목: items,
    },
    warnings,
  };
}

module.exports = {
  SUFFICIENCY,
  BUILTIN_SURVEY_TITLES,
  VALIDATED_SCORE_BOUNDS,
  isValidatedScoreBand,
  buildReportContext,
  allowedNumbers,
  numbersInText,
  reportInstructions,
  buildReportRequest,
  requestAnalysisReport,
  validateAnalysisReport,
  extractOutputText,
};
