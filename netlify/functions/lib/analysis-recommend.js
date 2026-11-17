"use strict";

// STEP 2 'AI에게 추천 더 받기'.
// 규칙 추천은 그대로 두고, AI 가 문항의 뜻을 보고 교차 기준을 "덧붙인다".
//   ① buildRecommendContext   — AI 에 보낼 설문 구조 + 응답 요약. 사람별 응답·서술형 답은 넣지 않는다.
//   ② buildRecommendRequest   — AI 요청 본문 (지금은 프로젝트가 쓰는 OpenAI Responses 형식)
//   ③ validateRecommendations — AI 답을 믿지 않고 검사한다:
//      지원하는 기준인지 · 문항이 실제 있고 선택형인지 · 이 조건에 나눌 값이 있는지 · 중복 ·
//      총점·연령 경계값은 AI 가 정하지 못함(화면이 규칙의 참고 구간을 씀) · 최대 5개 · 문장 길이 · 개인정보 형태
// 서버가 돌려주는 축은 화면(v8-workspace.js anDim)의 종류 이름을 쓴다: question · age · score · gender ·
// institution · sigungu · status · month · all

const { maskPersonalInfo } = require("./reference-docs.js");
const { validateSpec } = require("./crosstab.js");
const { allowedNumbers, numbersInText } = require("./analysis-report.js");

const MAX_RECOMMENDATIONS = 5;
const LIMITS = { why: 220, warn: 160, questions: 40, options: 20, text: 200, existing: 30, proposals: 12 };
const CHOICE_TYPES = ["single_choice", "multiple_choice"];

// AI 가 쓰는 기준 이름 → 화면의 축 종류
const AXIS_BY_NAME = { "문항": "question", "연령대": "age", "총점 구간": "score", "성별": "gender", "기관": "institution", "시군구": "sigungu", "처리 상태": "status", "조사 월": "month", "전체": "all" };
const AXIS_TITLE = { age: "연령대", score: "총점 구간", gender: "성별", institution: "기관별", sigungu: "시군구", status: "처리 상태", month: "조사 월", all: "전체" };
const KINDS = new Set(Object.values(AXIS_BY_NAME));

function cleanText(value, max) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const axisTitle = (axis) => (axis.kind === "question" ? `문항 ${axis.questionNo} 응답` : AXIS_TITLE[axis.kind] || axis.kind);
const axisKey = (axis) => (axis.kind === "question" ? `question:${axis.questionNo}` : axis.kind);
// 행·열을 바꿔도 같은 표 정보이므로 순서 없이 비교한다
const pairKey = (row, col) => [axisKey(row), axisKey(col)].sort().join("|");

// 화면이 보낸 "이미 있는 기준" (중복 제거에만 쓴다. 믿을 필요가 없는 값이라 모양만 정리한다)
function sanitizeExisting(list) {
  const axis = (value) => {
    const kind = String(value?.kind || "");
    if (!KINDS.has(kind)) return null;
    if (kind !== "question") return { kind };
    const questionNo = Number(value.questionNo);
    return Number.isSafeInteger(questionNo) && questionNo > 0 ? { kind, questionNo } : null;
  };
  return (Array.isArray(list) ? list : []).slice(0, LIMITS.existing)
    .map((item) => ({ row: axis(item?.row), col: axis(item?.col) }))
    .filter((item) => item.row && item.col);
}

// ── ① AI 입력 ─────────────────────────────────────────────────────────────────
// questions: [{ questionNo, questionText, answerType, options: [{ optionText, score }] }]
// facts: 이 조건의 데이터에서 나눌 수 있는 값이 있는지 (서버가 제출건에서 센 값)
function buildRecommendContext({ survey = {}, questions = [], summary = {}, itemRates = [], facts = {}, existing = [] }) {
  const rateByNo = new Map(itemRates.map((rate) => [String(rate.questionNo), rate]));
  const choice = questions.filter((question) => CHOICE_TYPES.includes(question.answerType));
  const axes = availableAxes({ summary, facts, hasScore: survey.scoringEnabled, choiceCount: choice.length });
  return {
    설문: {
      제목: cleanText(survey.title, LIMITS.text),
      설명: cleanText(survey.description, 300) || null,
      목적: cleanText(survey.purpose, 300) || null,
      대상: cleanText(survey.targetAudience, LIMITS.text) || null,
      배점_사용: Boolean(survey.scoringEnabled),
    },
    응답_요약: {
      응답_수: summary.n ?? 0,
      나이_기록_건수: summary.ageKnown ?? 0,
      성별_기록_건수: summary.genderKnown ?? 0,
      기관_수: summary.institutionCount ?? 0,
      시군구_수: facts.sigunguCount ?? 0,
      조사_월_수: summary.monthCount ?? 0,
      총점_범위: survey.scoringEnabled && summary.minScore != null ? `${summary.minScore}~${summary.maxScore}점` : null,
    },
    선택형_문항: choice.slice(0, LIMITS.questions).map((question) => {
      const rate = rateByNo.get(String(question.questionNo));
      return {
        번호: Number(question.questionNo),
        문장: cleanText(question.questionText, LIMITS.text),
        종류: question.answerType === "multiple_choice" ? "복수 선택" : "단일 선택",
        보기: (question.options || []).slice(0, LIMITS.options).map((option) => cleanText(option.optionText, 60) + (survey.scoringEnabled && Number.isFinite(Number(option.score)) ? ` (${Number(option.score)}점)` : "")),
        응답자_수: rate?.total ?? 0,
        응답_분포: (rate?.distribution || []).slice(0, LIMITS.options).map((item) => `${cleanText(item.label, 60)} ${item.pct}%`),
      };
    }),
    표로_나누지_않는_서술형_문항_수: questions.length - choice.length,
    이미_있는_기준: existing.map((item) => `${axisTitle(item.row)} × ${axisTitle(item.col)}`),
    쓸_수_있는_기준: axes.map((kind) => Object.keys(AXIS_BY_NAME).find((name) => AXIS_BY_NAME[name] === kind)),
  };
}

// 이 조건의 데이터로 표를 나눌 수 있는 기준
function availableAxes({ summary = {}, facts = {}, hasScore, choiceCount }) {
  const axes = [];
  if (choiceCount > 0) axes.push("question");
  if ((summary.ageKnown ?? 0) > 0) axes.push("age");
  // 점수 범위가 3점보다 좁으면 화면의 참고 구간이 한 칸뿐이라 나눌 수 없다 (anScoreBounds 와 같은 기준)
  if (hasScore && summary.minScore != null && summary.maxScore - summary.minScore >= 3) axes.push("score");
  if ((summary.genderKnown ?? 0) > 0) axes.push("gender");
  if ((summary.institutionCount ?? 0) > 1) axes.push("institution");
  if ((facts.sigunguCount ?? 0) > 1) axes.push("sigungu");
  if ((facts.statusKinds ?? 0) > 1) axes.push("status");
  if ((summary.monthCount ?? 0) > 1) axes.push("month");
  axes.push("all");
  return axes;
}

// ── ② AI 요청 ─────────────────────────────────────────────────────────────────
function recommendInstructions() {
  return [
    "당신은 공공 돌봄 분야 설문의 집계 표 설계를 돕는 분석가입니다.",
    "입력의 [설문 정보]는 설문 문항 구조와 응답 요약입니다. 사람별 응답은 없습니다.",
    "표 하나는 '행 기준 × 열 기준'으로 응답자 수와 비율을 셉니다. 문항의 뜻을 보고 함께 보면 실무에 쓸모 있는 조합을 추천하세요.",
    "예: 원인이나 상황을 묻는 문항 × 결과나 필요를 묻는 문항, 서비스 대상 구분에 쓰일 문항 × 기관·연령대.",
    "이미_있는_기준과 같은 조합(행·열을 바꾼 것 포함)은 추천하지 마세요.",
    "기준의 종류는 쓸_수_있는_기준에 있는 이름만 쓰세요. 문항은 선택형_문항의 번호만 쓰세요. 서술형 문항은 쓸 수 없습니다.",
    "총점 구간·연령대의 경계값이나 위험 기준점은 정하지 마세요. 경계값은 화면이 정합니다.",
    "근거에는 왜 이 조합이 쓸모 있는지 문항의 뜻으로 설명하세요. 입력에 없는 수치는 쓰지 말고, 인과관계를 단정하지 마세요.",
    "응답자가 적거나 칸이 잘게 나뉠 걱정이 있으면 주의에 짧게 적으세요.",
    `추천은 최대 ${MAX_RECOMMENDATIONS}개입니다. 쓸모 있는 조합이 없으면 빈 배열을 돌려주세요. 모든 문장은 한국어로 씁니다.`,
    "개인을 식별할 수 있는 정보는 절대 출력하지 마세요.",
    "JSON 객체만 반환하세요.",
    '형식: {"추천":[{"행":{"종류":"문항","문항_번호":3},"열":{"종류":"기관"},"근거":"한두 문장","주의":"없으면 빈 문자열"}]}',
  ].join("\n");
}

function buildRecommendRequest({ model, context }) {
  return {
    model,
    instructions: recommendInstructions(),
    input: [{ role: "user", content: [{ type: "input_text", text: `[설문 정보]\n${JSON.stringify(context)}\n\n지정한 JSON 객체 형식으로만 답하세요.` }] }],
    text: { format: { type: "json_object" } },
  };
}

// ── ③ AI 답 검사 ──────────────────────────────────────────────────────────────
// questions: 서버가 읽은 설문 문항 · itemRates: 서버가 센 문항별 응답 · existing: sanitizeExisting 결과
function validateRecommendations(raw, { context, questions = [], itemRates = [], summary = {}, facts = {}, hasScore, existing = [] }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const error = new Error("AI 추천 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
    error.statusCode = 502;
    throw error;
  }
  const proposals = Array.isArray(raw["추천"]) ? raw["추천"] : [];
  const questionByNo = new Map(questions.map((question) => [String(question.questionNo), question]));
  const rateByNo = new Map(itemRates.map((rate) => [String(rate.questionNo), rate]));
  const choiceCount = questions.filter((question) => CHOICE_TYPES.includes(question.answerType)).length;
  const available = new Set(availableAxes({ summary, facts, hasScore, choiceCount }));
  const seen = new Set(existing.map((item) => pairKey(item.row, item.col)));
  const allowed = allowedNumbers(context);

  const recommendations = [];
  const rejected = [];
  const warnings = [];
  let personal = 0;
  const mask = (text) => {
    const result = maskPersonalInfo(text);
    Object.values(result.found).forEach((count) => { personal += count; });
    return result.text;
  };
  const describe = (source) => {
    const name = cleanText(source?.["종류"], 20) || "?";
    const no = source?.["문항_번호"] ?? source?.["번호"];
    return name === "문항" ? `문항 ${cleanText(no, 6) || "?"} 응답` : name;
  };

  // 기준 하나 → 축. 쓸 수 없으면 이유를 던진다.
  const toAxis = (source, strippedBounds) => {
    const name = cleanText(source?.["종류"], 20);
    const kind = AXIS_BY_NAME[name];
    if (!kind) throw new Error(`지원하지 않는 기준입니다 (${name || "이름 없음"})`);
    if (["age", "score"].includes(kind) && ["경계값", "구간", "기준점", "boundaries"].some((field) => source[field] !== undefined)) strippedBounds.push(axisTitle({ kind }));
    if (kind === "question") {
      const questionNo = Number(source["문항_번호"] ?? source["번호"]);
      const question = questionByNo.get(String(questionNo));
      if (!Number.isSafeInteger(questionNo) || !question) throw new Error(`설문에 없는 문항입니다 (${cleanText(source["문항_번호"] ?? source["번호"], 6) || "번호 없음"})`);
      if (!CHOICE_TYPES.includes(question.answerType)) throw new Error("서술형 문항이라 표로 나눌 수 없습니다");
      if ((rateByNo.get(String(questionNo))?.distribution?.length || 0) < 2) throw new Error("이 조건에서 응답이 한 가지뿐인 문항이라 나눌 수 없습니다");
      return { kind, questionNo };
    }
    if (!available.has(kind)) {
      const reason = { age: "나이를 계산할 수 있는 응답이 없습니다", score: hasScore ? "총점 범위가 좁아 구간으로 나눌 수 없습니다" : "배점을 쓰지 않는 설문이라 총점 구간을 쓸 수 없습니다", gender: "성별 기록이 없습니다", institution: "이 조건에는 기관이 한 곳뿐입니다", sigungu: "이 조건에는 시군구가 한 곳뿐입니다", status: "이 조건에는 처리 상태가 한 가지뿐입니다", month: "이 조건에는 조사 월이 한 달뿐입니다" }[kind];
      throw new Error(reason);
    }
    return { kind };
  };

  proposals.slice(0, LIMITS.proposals).forEach((source) => {
    const label = `${describe(source?.["행"])} × ${describe(source?.["열"])}`;
    try {
      if (!source || typeof source !== "object") throw new Error("형식이 올바르지 않습니다");
      const strippedBounds = [];
      const row = toAxis(source["행"], strippedBounds);
      const col = toAxis(source["열"], strippedBounds);
      if (row.kind === "all" && col.kind === "all") throw new Error("나눌 기준이 없습니다");
      if (axisKey(row) === axisKey(col)) throw new Error("행과 열이 같은 기준입니다");
      const key = pairKey(row, col);
      if (seen.has(key)) throw new Error("이미 있는 기준과 같습니다");
      // 표 엔진이 받는 조합인지 확인한다 (경계값은 화면이 참고 구간을 넣으므로 여기서는 자리만 채운다)
      const dim = (axis) => (axis.kind === "question" ? { kind: "question", questionNo: axis.questionNo }
        : axis.kind === "age" ? { kind: "number_bins", field: "age", boundaries: [75, 85] }
        : axis.kind === "score" ? { kind: "number_bins", field: "score", boundaries: [] }
        : ["all", "month"].includes(axis.kind) ? { kind: axis.kind } : { kind: "attribute", field: axis.kind });
      validateSpec({ row: dim(row), col: dim(col), cells: ["count", "pct"] });

      const why = mask(cleanText(source["근거"], LIMITS.why));
      if (!why) throw new Error("근거가 없습니다");
      const notes = [];
      const cautions = mask(cleanText(source["주의"], LIMITS.warn));
      if (cautions) notes.push(cautions);
      const unknownNumbers = [...new Set(numbersInText(`${why} ${cautions}`).filter((value) => !allowed.has(value)))];
      if (unknownNumbers.length) notes.push(`AI 근거의 수치 ${unknownNumbers.slice(0, 5).join(", ")}은(는) 통계에서 찾지 못했습니다. 표의 실제 숫자로 확인하세요.`);
      if (strippedBounds.length) warnings.push(`${label}: AI가 정한 ${strippedBounds.join("·")} 경계값은 쓰지 않고 화면의 참고 구간으로 바꿨습니다.`);
      if (recommendations.length >= MAX_RECOMMENDATIONS) throw new Error(`추천은 최대 ${MAX_RECOMMENDATIONS}개까지 씁니다`);
      seen.add(key);
      recommendations.push({ row, col, why, warn: notes.join(" ") });
    } catch (error) {
      if (error.code === "INVALID_ANALYSIS_SPEC") rejected.push({ 기준: label, 이유: "표로 만들 수 없는 조합입니다" });
      else rejected.push({ 기준: label, 이유: error.message });
    }
  });
  if (proposals.length > LIMITS.proposals) warnings.push(`AI가 추천을 너무 많이 보내 앞의 ${LIMITS.proposals}개만 검사했습니다.`);
  if (personal) warnings.push(`AI 추천 문장에서 개인정보 형태 ${personal}건을 가렸습니다.`);
  return { recommendations, rejected, warnings };
}

module.exports = {
  MAX_RECOMMENDATIONS,
  AXIS_BY_NAME,
  sanitizeExisting,
  availableAxes,
  buildRecommendContext,
  recommendInstructions,
  buildRecommendRequest,
  validateRecommendations,
};
