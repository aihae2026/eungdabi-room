"use strict";

/**
 * 로컬 기능 테스트용 가짜 API 서버 (개발 전용, 운영과 무관).
 *
 * 운영 Supabase에 접속하지 않고 메모리 위의 **가상 데이터**로 화면을 돌려본다.
 * 집계 계산은 실제 코드(netlify/functions/lib/*)를 그대로 호출하므로,
 * 화면·API 연결과 집계 결과를 운영 데이터 없이 확인할 수 있다.
 *
 *   node scripts/dev-mock-server.js         → http://localhost:8899
 *   node scripts/dev-mock-server.js 9000    → 포트 지정
 *
 * 로그인(가상 계정):
 *   MOCKCENTRAL / mock1234  → 중앙기관 (전체 기관 조회)
 *   MOCKAG001   / mock1234  → 수행기관 (본인 기관만)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { computeCrosstab } = require("../netlify/functions/lib/crosstab.js");
const { normalizeSubmissions, summarize, itemRates, primaryLabelsFromTemplate } = require("../netlify/functions/lib/analysis.js");
const { normalizeReferenceFiles } = require("../netlify/functions/lib/reference-docs.js");
const { buildReportContext, validateAnalysisReport } = require("../netlify/functions/lib/analysis-report.js");
const { AXIS_BY_NAME, sanitizeExisting, buildRecommendContext, validateRecommendations } = require("../netlify/functions/lib/analysis-recommend.js");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8899);
const PASSWORD = "mock1234";
let adminUxPreview = null;

// ── 가상 설문 정의 (assets/app.js 의 checklistDefs 와 같은 보기·배점) ──────────
const CHECKLISTS = {
  fall: { label: "낙상 체크리스트", count: 20, options: [["예", 5], ["아니오", 0], ["미해당", 0]] },
  depression: { label: "우울 체크리스트", count: 9, options: [["없음", 0], ["2~3일 이상", 1], ["7일 이상", 2], ["거의 매일", 3]] },
  memory: { label: "기억 체크리스트", count: 14, options: [["아니오", 0], ["네", 1]] },
};

// ── 재현 가능한 난수 (같은 씨앗 → 항상 같은 가상 데이터) ─────────────────────
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260911);

// 문항마다 "이 항목이 얼마나 흔한가"가 다르도록 배수를 만든다 (평균 1이 되게 정규화).
function itemFactors(count) {
  const raw = Array.from({ length: count }, () => 0.15 + rand() * 1.8);
  const mean = raw.reduce((sum, value) => sum + value, 0) / count;
  return raw.map((value) => value / mean);
}

// 응답 1개 고르기. risk(0~1)가 높을수록 배점이 높은 보기가 나온다.
function pickAnswer(def, risk) {
  const hasNA = def.options.some(([label]) => label === "미해당");
  if (hasNA && rand() < 0.05) return ["미해당", 0];
  const scoring = def.options.filter(([label]) => label !== "미해당").sort((a, b) => a[1] - b[1]);
  if (rand() >= risk) return scoring[0]; // 위험 아님 → 가장 낮은 배점
  const upper = scoring.slice(1);
  const roll = rand();
  const idx = roll < 0.62 ? 0 : roll < 0.89 ? Math.min(1, upper.length - 1) : upper.length - 1;
  return upper[idx];
}

// ── 가상 기관 ─────────────────────────────────────────────────────────────────
const INSTITUTIONS = [
  { code: "MOCKCENTRAL", name: "가상 중앙기관", type: "central", sido: "", sigungu: "", parentCode: null },
  { code: "MOCKREGION1", name: "가상 광역지원기관", type: "regional", sido: "가상특별시", sigungu: "", parentCode: null },
  { code: "MOCKAG001", name: "가상수행기관 001", type: "agency", sido: "가상특별시", sigungu: "가상구 A", parentCode: "MOCKREGION1" },
  { code: "MOCKAG002", name: "가상수행기관 002", type: "agency", sido: "가상특별시", sigungu: "가상구 A", parentCode: "MOCKREGION1" },
  { code: "MOCKAG003", name: "가상수행기관 003", type: "agency", sido: "가상특별시", sigungu: "가상구 B", parentCode: "MOCKREGION1" },
  { code: "MOCKAG004", name: "가상수행기관 004", type: "agency", sido: "가상도", sigungu: "가상시 C", parentCode: null },
  { code: "MOCKAG005", name: "가상수행기관 005", type: "agency", sido: "가상도", sigungu: "가상시 C", parentCode: null },
  { code: "MOCKAG006", name: "가상수행기관 006", type: "agency", sido: "가상도", sigungu: "가상군 D", parentCode: null },
].map((row) => ({ ...row, active: true, managedTargetCount: 200 + Math.floor(rand() * 400) }));

const AGENCIES = INSTITUTIONS.filter((row) => row.type === "agency");

// ── 가상 제출건 ───────────────────────────────────────────────────────────────
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

// 설문 종류마다 문항별 배수를 한 번만 만들어 둔다.
const ITEM_FACTORS = Object.fromEntries(Object.entries(CHECKLISTS).map(([type, def]) => [type, itemFactors(def.count)]));

function buildSubmissions(total) {
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    const institution = AGENCIES[Math.floor(rand() * AGENCIES.length)];
    const type = rand() < 0.6 ? "fall" : rand() < 0.6 ? "depression" : "memory";
    const def = CHECKLISTS[type];

    // 사람마다 위험 수준이 다르고(personRisk), 고령일수록 조금 더 높게 잡는다.
    const birthYear = 1930 + Math.floor(rand() * 26);
    const ageBias = birthYear < 1940 ? 0.08 : birthYear < 1950 ? 0.03 : 0;
    const personRisk = 0.08 + rand() * 0.48 + ageBias;

    const answers = [];
    let score = 0;
    for (let q = 1; q <= def.count; q += 1) {
      const risk = Math.min(0.95, Math.max(0.01, personRisk * ITEM_FACTORS[type][q - 1]));
      const [label, value] = pickAnswer(def, risk);
      answers.push({ question_no: q, answer_label: label });
      score += value;
    }

    const month = rand() < 0.45 ? 8 : 9;
    const day = 1 + Math.floor(rand() * 28);
    const surveyDate = `2026-${pad(month)}-${pad(day)}`;
    const status = rand() < 0.65 ? "확인 완료" : "확인 대기";

    rows.push({
      id: `mock-${pad(i + 1, 4)}`,
      institution_code: institution.code,
      institutions: { name: institution.name, sido: institution.sido, sigungu: institution.sigungu },
      checklist_type: type,
      template_id: null,
      survey_date: surveyDate,
      submitted_at: `${surveyDate}T${pad(8 + Math.floor(rand() * 9))}:${pad(Math.floor(rand() * 60))}:00+09:00`,
      client_name: `가상대상자 ${pad(i + 1, 4)}`,
      client_gender: rand() < 0.82 ? "여" : "남",
      client_birth: `${birthYear}-${pad(1 + Math.floor(rand() * 12))}-${pad(1 + Math.floor(rand() * 28))}`,
      client_id: status === "확인 완료" ? `H*****${pad(1000000 + Math.floor(rand() * 8999999), 7)}` : "",
      worker_name: `가상조사자 ${pad(1 + Math.floor(rand() * 20))}`,
      worker_phone: "010-0000-0000",
      status,
      total_score: score,
      field_memo: "",
      submission_answers: answers,
    });
  }
  return rows;
}

const BUILTIN_SUBMISSIONS = buildSubmissions(620);

// ── 가상 자체 설문 (중앙기관이 만든 양식) ───────────────────────────────────────
// 운영 중(배점 있음) · 종료(배점 없음) · 작성 중(제출 불가) 세 가지. 문항 종류를 골고루 넣는다:
// 단일 선택 · 복수 선택 · '기타(직접 입력)'가 있는 단일 선택 · 서술형.
// 기존 기본 설문 가상 데이터가 바뀌지 않도록 난수 씨앗을 따로 쓴다.
const trand = mulberry32(20260914);
const opt = (optionText, score = 0, requiresText = false) => ({ optionText, score, requiresText });
const TEMPLATES = [
  {
    id: "7b2f1c3e-9a4d-4c11-8e6a-1d2b3c4d5e61",
    title: "주거환경 안전 점검",
    status: "active",
    scoringEnabled: true,
    questions: [
      { questionNo: 1, questionText: "집 안 바닥 상태는 어떤가요?", answerType: "single_choice", options: [opt("양호", 0), opt("보통", 1), opt("불량", 2)] },
      { questionNo: 2, questionText: "집 안에서 위험하다고 느끼는 곳을 모두 고르세요.", answerType: "multiple_choice", options: [opt("욕실", 1), opt("계단", 2), opt("현관", 1), opt("주방", 1)] },
      { questionNo: 3, questionText: "야간 조명은 충분한가요?", answerType: "single_choice", options: [opt("충분함", 0), opt("부족함", 2), opt("기타", 1, true)] },
      { questionNo: 4, questionText: "그 밖에 불편한 점이 있으면 적어 주세요.", answerType: "text", options: [] },
    ],
  },
  {
    id: "7b2f1c3e-9a4d-4c11-8e6a-1d2b3c4d5e62",
    title: "여름철 건강 설문",
    status: "closed",
    scoringEnabled: false,
    questions: [
      { questionNo: 1, questionText: "최근 일주일 동안 더위로 힘든 적이 있었나요?", answerType: "single_choice", options: [opt("예"), opt("아니오")] },
      { questionNo: 2, questionText: "더위를 피하려고 한 일을 모두 고르세요.", answerType: "multiple_choice", options: [opt("에어컨"), opt("선풍기"), opt("무더위쉼터"), opt("기타", 0, true)] },
    ],
  },
  {
    id: "7b2f1c3e-9a4d-4c11-8e6a-1d2b3c4d5e63",
    title: "작성 중인 양식",
    status: "draft",
    scoringEnabled: true,
    questions: [{ questionNo: 1, questionText: "초안 문항", answerType: "single_choice", options: [opt("예", 1), opt("아니오", 0)] }],
  },
];
if (process.argv.includes('--admin-ux')) adminUxPreview = require('./admin-ux-preview-api.cjs').createPreviewApi(TEMPLATES);
const findTemplate = (id) => TEMPLATES.find((template) => template.id === id);

// 운영의 normalizeDynamicAnswer 와 같은 모양으로 응답을 만든다 (answer_label + answer_value).
function templateAnswer(question) {
  if (question.answerType === "text") {
    const samples = ["현관 턱이 높아요", "욕실 바닥이 미끄러워요", "", "", "특별히 없음"];
    const text = samples[Math.floor(trand() * samples.length)];
    return { label: text || null, value: { text }, score: 0 };
  }
  const pool = question.options;
  let chosen;
  if (question.answerType === "multiple_choice") {
    chosen = pool.filter(() => trand() < 0.4);
    if (chosen.length === 0) chosen = [pool[Math.floor(trand() * pool.length)]];
  } else {
    chosen = [pool[Math.floor(trand() * pool.length)]];
  }
  const optionTexts = {};
  const extras = ["옆집 김○○ 할머니 댁", "복도 전등 고장", "경로당"];
  const labels = chosen.map((option, i) => {
    if (!option.requiresText) return option.optionText;
    const extra = extras[Math.floor(trand() * extras.length)];
    optionTexts[`opt-${i}`] = extra;
    return `${option.optionText}: ${extra}`;
  });
  return {
    label: labels.join(", "),
    value: { optionIds: chosen.map((_, i) => `opt-${i}`), labels: chosen.map((option) => option.optionText), optionTexts },
    score: chosen.reduce((sum, option) => sum + option.score, 0),
  };
}

function buildTemplateSubmissions(template, count, months, startIndex) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const institution = AGENCIES[Math.floor(trand() * AGENCIES.length)];
    const answers = template.questions.map((question) => {
      const answer = templateAnswer(question);
      return { question_no: question.questionNo, question_text: question.questionText, answer_label: answer.label, answer_value: answer.value, score: answer.score };
    });
    const month = months[Math.floor(trand() * months.length)];
    const surveyDate = `2026-${pad(month)}-${pad(1 + Math.floor(trand() * 28))}`;
    const status = trand() < 0.55 ? "확인 완료" : "확인 대기";
    const birthYear = 1932 + Math.floor(trand() * 24);
    rows.push({
      id: `mock-t-${pad(startIndex + i, 4)}`,
      institution_code: institution.code,
      institutions: { name: institution.name, sido: institution.sido, sigungu: institution.sigungu },
      checklist_type: null,
      template_id: template.id,
      checklist_title: template.title,
      scoring_enabled: template.scoringEnabled,
      survey_date: surveyDate,
      submitted_at: `${surveyDate}T${pad(9 + Math.floor(trand() * 8))}:${pad(Math.floor(trand() * 60))}:00+09:00`,
      client_name: `가상대상자 T${pad(startIndex + i, 4)}`,
      client_gender: trand() < 0.78 ? "여" : "남",
      client_birth: `${birthYear}-${pad(1 + Math.floor(trand() * 12))}-${pad(1 + Math.floor(trand() * 28))}`,
      client_id: status === "확인 완료" ? `H*****${pad(1000000 + Math.floor(trand() * 8999999), 7)}` : "",
      worker_name: `가상조사자 ${pad(1 + Math.floor(trand() * 20))}`,
      worker_phone: "010-0000-0000",
      status,
      total_score: template.scoringEnabled ? answers.reduce((sum, answer) => sum + answer.score, 0) : 0,
      field_memo: "",
      submission_answers: answers,
    });
  }
  return rows;
}

const TEMPLATE_SUBMISSIONS = [
  ...buildTemplateSubmissions(TEMPLATES[0], 140, [8, 9], 1),
  ...buildTemplateSubmissions(TEMPLATES[1], 70, [7, 8], 141),
];
const SUBMISSIONS = adminUxPreview ? [...TEMPLATE_SUBMISSIONS, ...BUILTIN_SUBMISSIONS] : [...BUILTIN_SUBMISSIONS, ...TEMPLATE_SUBMISSIONS];
if (adminUxPreview) {
  for (const row of TEMPLATE_SUBMISSIONS) {
    const answer = row.submission_answers.find(a => a.question_no === 4 || a.questionNo === 4);
    if (answer) answer.answer_label = '긴 답변 표시를 확인하기 위한 합성 문장입니다. 문항은 답변 길이에 영향을 받지 않고 위쪽에 표시됩니다. '.repeat(12);
  }
}

// ── 토큰 (운영과 같은 개념: 기관코드 + 역할 범위) ─────────────────────────────
function makeToken(institution) {
  return Buffer.from(JSON.stringify({ agencyCode: institution.code, role: institution.type, scope: "admin" }), "utf8").toString("base64url");
}
function readToken(req) {
  const header = req.headers.authorization || "";
  const raw = header.replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
// 운영의 scopedInstitutionCodes 와 같은 규칙: 중앙=전체, 광역=관할, 수행=본인
function scopedCodes(token) {
  if (!token) return [];
  if (token.role === "central") return null; // 전체
  if (token.role === "regional") return AGENCIES.filter((row) => row.parentCode === token.agencyCode).map((row) => row.code);
  return [token.agencyCode];
}

// ── 조회 조건 적용 ────────────────────────────────────────────────────────────
function filterSubmissions(token, query) {
  const codes = scopedCodes(token);
  return SUBMISSIONS.filter((row) => {
    if (codes && !codes.includes(row.institution_code)) return false;
    if (query.templateId && row.template_id !== query.templateId) return false;
    if (query.type && row.checklist_type !== query.type) return false;
    if (query.checklistType && row.checklist_type !== query.checklistType) return false;
    if (query.agencyCode && row.institution_code !== query.agencyCode) return false;
    if (query.sido && row.institutions.sido !== query.sido) return false;
    if (query.sigungu && row.institutions.sigungu !== query.sigungu) return false;
    if (query.startDate && row.survey_date < query.startDate) return false;
    if (query.endDate && row.survey_date > query.endDate) return false;
    if (query.status && row.status !== query.status) return false;
    return true;
  });
}

// ── /stats 응답 (위험 구간은 데모용 임의 기준) ────────────────────────────────
const RISK_BANDS = {
  fall: [["low", (s) => s < 30], ["medium", (s) => s < 60], ["high", () => true]],
  depression: [["none", (s) => s < 5], ["low", (s) => s < 10], ["medium", (s) => s < 20], ["high", () => true]],
  memory: [["normal", (s) => s < 4], ["risk", () => true]],
};

// 운영 /stats 와 같은 결과 모양:
//   - 기본 3종은 종류별 total/waiting/done/위험 구간 칸 (DB 함수 흉내)
//   - waiting_total / done_total 은 자체 설문까지 포함한 모든 제출건의 확인 상태
//   - templateId 를 고르면 그 양식 제출건만 기관별로 센다
function statsRows(token, query) {
  const rows = filterSubmissions(token, query);
  const byCode = new Map();
  for (const row of rows) {
    if (!byCode.has(row.institution_code)) {
      byCode.set(row.institution_code, { institution_code: row.institution_code, total: 0, clients: new Set(), waiting_total: 0, done_total: 0 });
    }
    const bucket = byCode.get(row.institution_code);
    bucket.total += 1;
    if (row.client_id) bucket.clients.add(row.client_id);
    if (row.status === "확인 완료") bucket.done_total += 1;
    else bucket.waiting_total += 1;
    const type = row.checklist_type;
    if (!type) continue; // 자체 설문: DB 함수에는 종류별 칸이 없다
    bucket[`${type}_total`] = (bucket[`${type}_total`] || 0) + 1;
    bucket[`${type}_${row.status === "확인 완료" ? "done" : "waiting"}`] =
      (bucket[`${type}_${row.status === "확인 완료" ? "done" : "waiting"}`] || 0) + 1;
    const band = RISK_BANDS[type].find(([, test]) => test(row.total_score))[0];
    bucket[`${type}_${band}`] = (bucket[`${type}_${band}`] || 0) + 1;
  }
  return [...byCode.values()].map(({ clients, ...rest }) => ({ ...rest, unique_clients: clients.size }));
}

function statsTemplateView(template) {
  return {
    id: template.id,
    title: template.title,
    status: template.status,
    scoringEnabled: template.scoringEnabled,
    questions: template.questions.map((question) => ({
      questionNo: question.questionNo,
      questionText: question.questionText,
      answerType: question.answerType,
      options: question.options.map((option) => ({ optionText: option.optionText, score: option.score })),
    })),
  };
}

// ── STEP 4 결과 분석 (가짜 AI) ─────────────────────────────────────────────────
// 운영과 같은 참고자료 검사·통계 재계산·AI 답 검사 코드를 그대로 쓰고, AI 호출만 가짜로 바꾼다.
// MOCKAG002 는 "계정 AI 미설정"으로 둬서 안내 화면을 확인할 수 있게 한다.
const MOCK_AGENCIES_WITHOUT_AI_KEY = ["MOCKAG002"];
const BUILTIN_TITLES = { fall: "낙상 체크리스트", depression: "우울 체크리스트", memory: "기억 체크리스트" };

function mockAnalysis(token, body) {
  const statusMode = body.status === "completed" ? "completed" : "all";
  const template = body.templateId ? findTemplate(body.templateId) : null;
  if (body.templateId && (!template || !["active", "closed"].includes(template.status))) {
    const error = new Error("통계에서 볼 수 있는 설문 양식이 아닙니다."); error.statusCode = 404; throw error;
  }
  const rows = filterSubmissions(token, {
    checklistType: template ? undefined : body.checklistType,
    templateId: template ? template.id : undefined,
    agencyCode: body.agencyCode, sido: body.sido, sigungu: body.sigungu, startDate: body.startDate, endDate: body.endDate,
    status: statusMode === "completed" ? "확인 완료" : undefined,
  });
  const records = normalizeSubmissions(rows);
  const specs = Array.isArray(body.specs) ? body.specs.slice(0, 8) : [];
  return {
    template, records, statusMode,
    summary: summarize(records),
    itemRates: template ? itemRates(records, { primaryByQuestion: primaryLabelsFromTemplate(statsTemplateView(template)), builtinOrder: false }) : itemRates(records),
    tables: specs.map((spec) => ({ spec, ...computeCrosstab(records, spec) })),
    filters: { checklistType: template ? "" : body.checklistType, templateId: template ? template.id : "", startDate: body.startDate, endDate: body.endDate, sido: body.sido, sigungu: body.sigungu, agencyCode: body.agencyCode },
  };
}

// 실제 AI 대신 통계 결과의 숫자를 인용해 답을 만든다.
// 안전장치를 눈으로 확인할 수 있게 일부러 두 가지 실수를 섞는다:
//   ① 통계 결과에 없는 숫자 인용  → 서버가 '수치 확인 필요 · 판단 보류'로 내린다
//   ② 참고자료 없이 요청했는데 참고자료 근거를 적음 → 서버가 지우고 알린다
function fakeAiAnswer(context, references) {
  const hasReferences = references.length > 0;
  const excerpt = references.find((file) => file.text)?.text.split("\n").find((line) => line.trim().length > 4)?.slice(0, 60);
  const items = [];
  const table = context.표[0];
  if (table && table.행.length && table.열.length) {
    let best = null;
    table.행.forEach((row) => row.칸.forEach((cell, ci) => {
      if (row.응답자_수 >= 5 && cell.비율 != null && (!best || cell.비율 > best.cell.비율)) best = { row, cell, col: table.열[ci] };
    }));
    if (best) {
      items.push({
        분석_결과: `${best.row.이름}에서 '${best.col}' 비율이 ${best.cell.비율}%로 표 1에서 가장 높습니다.`,
        사용한_통계값: [`표 1 · ${table.기준}: ${best.row.이름} ${best.col} ${best.cell.인원}명 (${best.cell.비율}%, 응답자 ${best.row.응답자_수}명)`],
        참고자료_근거: hasReferences ? `참고자료 1: "${excerpt || "PDF 참고자료의 관련 내용"}"` : null,
        해석: "해당 집단에서 이 응답이 상대적으로 흔하므로 우선 확인 대상을 정할 때 참고할 수 있습니다.",
        주의사항: "집단 간 차이는 이용자 구성의 차이일 수 있으며 원인을 뜻하지 않습니다.",
        근거_충분도: best.row.응답자_수 >= 30 ? "충분" : "부분적",
      });
    }
  }
  items.push({
    분석_결과: `분석 대상 ${context.요약.응답_수}건 중 확인 완료는 ${context.요약.확인_완료}건입니다.`,
    사용한_통계값: [`요약: 응답 수 ${context.요약.응답_수}건, 확인 완료 ${context.요약.확인_완료}건, 확인 대기 ${context.요약.확인_대기}건`],
    참고자료_근거: hasReferences ? null : "사업 지침에 따르면 확인 완료 비율을 70% 이상 유지해야 합니다.", // ② 일부러 넣은 실수
    해석: "확인 대기 건이 남아 있어 결과를 확정하기 전에 검토 진행 상황을 함께 보는 것이 좋습니다.",
    주의사항: "확인 완료는 위험 해소를 뜻하지 않습니다.",
    근거_충분도: "충분",
  });
  const rate = context.문항별_대표_응답[0];
  if (rate) {
    items.push({
      분석_결과: `${rate.문항}의 대표 응답 '${rate.대표_응답}'이(가) ${rate.비율}%로 문항 중 가장 높습니다.`,
      사용한_통계값: [`문항별 대표 응답: ${rate.문항} '${rate.대표_응답}' ${rate.비율}% (응답자 ${rate.응답자_수}명)`],
      참고자료_근거: null,
      해석: "이 항목을 우선 점검 항목으로 검토할 수 있습니다.",
      주의사항: rate.복수_선택 ? "복수 선택 문항이라 비율은 응답자 대비입니다." : "응답자의 자기 보고에 기반합니다.",
      근거_충분도: "부분적",
    });
  }
  if (table) {
    items.push({
      분석_결과: "전체적으로 위험 응답이 늘어나는 추세입니다.",
      사용한_통계값: [`표 1 전체 응답자 ${table.전체_응답자_수 + 137}명 중 증가율 18.4%`], // ① 일부러 넣은 없는 숫자
      참고자료_근거: null,
      해석: "시기별 비교 자료가 필요합니다.",
      주의사항: "추세를 판단할 근거가 부족합니다.",
      근거_충분도: "충분",
    });
  }
  return { blocked: false, blockedReason: "", 분석_항목: items };
}

async function handleAnalysisReport(req, res, token, body) {
  await new Promise((resolve) => setTimeout(resolve, 900)); // AI 를 기다리는 느낌
  try {
    const references = normalizeReferenceFiles(body.files);
    if (MOCK_AGENCIES_WITHOUT_AI_KEY.includes(token.agencyCode)) {
      return sendJson(res, 412, { message: "이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요." });
    }
    const analysis = mockAnalysis(token, body);
    if (!analysis.records.length) {
      return sendJson(res, 400, { message: "분석할 응답이 없습니다. 조회 조건을 바꿔 통계 결과를 다시 만든 뒤 요청해 주세요." });
    }
    const institutionNames = {};
    analysis.records.forEach((record) => { if (record.institution && record.institutionName) institutionNames[record.institution] = record.institutionName; });
    const context = buildReportContext({
      surveyTitle: analysis.template ? analysis.template.title : BUILTIN_TITLES[analysis.filters.checklistType] || analysis.filters.checklistType,
      questions: analysis.template ? analysis.template.questions : [],
      filters: analysis.filters, statusMode: analysis.statusMode, recordCount: analysis.records.length,
      summary: analysis.summary, itemRates: analysis.itemRates, tables: analysis.tables, institutionNames,
      scopeName: token.role === "agency" ? institutionNames[token.agencyCode] || token.agencyCode : "",
    });
    const { report, warnings } = validateAnalysisReport(fakeAiAnswer(context, references.files), { context, hasReferences: references.files.length > 0 });
    return sendJson(res, 200, {
      report, warnings: [...references.warnings, ...warnings],
      mode: references.files.length ? "with_references" : "statistics_only",
      referenceCount: references.files.length, model: "mock-analysis (가짜 AI)", generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { message: error.message || "결과 분석을 만들지 못했습니다." });
  }
}

// ── STEP 2 AI에게 추천 더 받기 (가짜 AI) ────────────────────────────────────────
// 운영과 같은 AI 입력 만들기 · AI 답 검사 코드를 그대로 쓰고, AI 호출만 가짜로 바꾼다.
// 서버 검사를 눈으로 확인할 수 있게 일부러 틀린 추천을 섞는다:
//   ① 설문에 없는 문항  ② 서술형 문항  ③ AI 가 정한 총점 경계값  ④ 이미 있는 기준을 행·열만 바꾼 것
//   ⑤ 지원하지 않는 기준  ⑥ 근거에 통계에 없는 수치
const AXIS_NAME = Object.fromEntries(Object.entries(AXIS_BY_NAME).map(([name, kind]) => [kind, name]));
const axisSource = (axis) => (axis.kind === "question" ? { 종류: "문항", 문항_번호: axis.questionNo } : { 종류: AXIS_NAME[axis.kind] });

function fakeAiRecommendations(context, { existing, textQuestionNo }) {
  const list = [];
  const questions = context.선택형_문항.filter((question) => question.응답_분포.length > 1);
  const axes = new Set(context.쓸_수_있는_기준);
  const [a, b, c] = questions;
  if (a && b) {
    list.push({ 행: { 종류: "문항", 문항_번호: a.번호 }, 열: { 종류: "문항", 문항_번호: b.번호 },
      근거: `'${a.문장}'의 응답에 따라 '${b.문장}'의 응답이 어떻게 달라지는지 함께 보면, 어떤 상황의 대상자에게 무엇이 필요한지 가늠할 수 있습니다.`,
      주의: "칸이 잘게 나뉘므로 응답자 수가 적은 칸은 참고로만 보세요." });
  }
  if (a && axes.has("기관")) {
    list.push({ 행: { 종류: "기관" }, 열: { 종류: "문항", 문항_번호: a.번호 }, 근거: `기관마다 '${a.문장}'의 응답이 어떻게 다른지 보고 기관별 지원 방향을 정할 때 참고할 수 있습니다.`, 주의: "기관 간 차이는 이용자 구성 차이일 수 있습니다." });
  }
  if ((c || a) && axes.has("성별")) {
    const q = c || a;
    list.push({ 행: { 종류: "성별" }, 열: { 종류: "문항", 문항_번호: q.번호 }, 근거: `'${q.문장}'의 응답이 성별에 따라 다른지 봅니다. 응답자의 87.65%가 여성인 조사라는 점을 감안하세요.`, 주의: "" }); // ⑥
  }
  list.push({ 행: { 종류: "문항", 문항_번호: 999 }, 열: { 종류: "기관" }, 근거: "없는 문항으로 나눠 봅니다.", 주의: "" }); // ①
  if (textQuestionNo) list.push({ 행: { 종류: "문항", 문항_번호: textQuestionNo }, 열: { 종류: "연령대" }, 근거: "서술형 답을 연령대별로 봅니다.", 주의: "" }); // ②
  list.push({ 행: { 종류: "총점 구간", 경계값: [10, 20] }, 열: { 종류: "성별" }, 근거: "총점 수준에 따라 성별 구성이 다른지 봅니다.", 주의: "" }); // ③
  if (existing[0]) list.push({ 행: axisSource(existing[0].col), 열: axisSource(existing[0].row), 근거: "이미 있는 기준을 뒤집어 봅니다.", 주의: "" }); // ④
  list.push({ 행: { 종류: "소득 구간" }, 열: { 종류: "전체" }, 근거: "소득별로 봅니다.", 주의: "" }); // ⑤
  return { 추천: list };
}

async function handleAnalysisRecommend(req, res, token, body) {
  await new Promise((resolve) => setTimeout(resolve, 900)); // AI 를 기다리는 느낌
  try {
    if (MOCK_AGENCIES_WITHOUT_AI_KEY.includes(token.agencyCode)) {
      return sendJson(res, 412, { message: "이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요." });
    }
    const analysis = mockAnalysis(token, { ...body, specs: [{ row: { kind: "all" }, col: { kind: "all" }, cells: ["count"] }] });
    if (!analysis.records.length) return sendJson(res, 400, { message: "추천할 응답이 없습니다. 조회 조건을 바꿔 주세요." });
    const template = analysis.template ? statsTemplateView(analysis.template) : null;
    const questions = template
      ? template.questions
      : analysis.itemRates.map((rate) => ({ questionNo: Number(rate.questionNo), questionText: `문항 ${rate.questionNo}`, answerType: "single_choice", options: rate.distribution.map((item) => ({ optionText: item.label })) }))
        .sort((x, y) => x.questionNo - y.questionNo);
    const hasScore = template ? template.scoringEnabled : true;
    const facts = {
      sigunguCount: new Set(analysis.records.map((record) => record.sigungu).filter(Boolean)).size,
      statusKinds: new Set(analysis.records.map((record) => record.status).filter(Boolean)).size,
    };
    const existing = sanitizeExisting(body.existing);
    const context = buildRecommendContext({
      survey: template ? { title: template.title, scoringEnabled: hasScore } : { title: BUILTIN_TITLES[analysis.filters.checklistType] || analysis.filters.checklistType, scoringEnabled: true },
      questions, summary: analysis.summary, itemRates: analysis.itemRates, facts, existing,
    });
    const textQuestionNo = questions.find((question) => !["single_choice", "multiple_choice"].includes(question.answerType))?.questionNo;
    const result = validateRecommendations(fakeAiRecommendations(context, { existing, textQuestionNo }), { context, questions, itemRates: analysis.itemRates, summary: analysis.summary, facts, hasScore, existing });
    return sendJson(res, 200, { ...result, model: "mock-analysis (가짜 AI)", generatedAt: new Date().toISOString() });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { message: error.message || "AI 추천을 만들지 못했습니다." });
  }
}

// ── 라우팅 ────────────────────────────────────────────────────────────────────
function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
}

function handleApi(req, res, url, body) {
  if (process.argv.includes('--intake-preview')) {
    const preview = require('./intake-preview-fixture.cjs')(url.pathname, req.method, body);
    if (preview) return sendJson(res, preview.status || 200, preview.body);
  }
  const route = url.pathname.replace(/^\/api/, "") || "/";
  const query = Object.fromEntries(url.searchParams);
  const token = readToken(req);

  if (req.method === "POST" && route === "/login") {
    const code = String(body.agencyCode || "").trim().toUpperCase();
    const institution = INSTITUTIONS.find((row) => row.code === code);
    if (!institution || body.password !== PASSWORD) {
      return sendJson(res, 401, { message: `가상 계정이 아닙니다. MOCKCENTRAL 또는 MOCKAG001 / ${PASSWORD} 로 로그인하세요.` });
    }
    return sendJson(res, 200, { token: makeToken(institution), agency: institution });
  }

  if (!token) return sendJson(res, 401, { message: "로그인이 필요합니다." });

  if (adminUxPreview) {
    const result = adminUxPreview(route, req.method, body, token.agencyCode);
    if (result) return sendJson(res, result.status || 200, result.body);
  }

  if (route === "/institutions") {
    const codes = scopedCodes(token);
    const visible = codes === null ? INSTITUTIONS : INSTITUTIONS.filter((row) => codes.includes(row.code) || row.code === token.agencyCode);
    return sendJson(res, 200, { institutions: visible });
  }

  if (route === "/home-summary") {
    const rows = filterSubmissions(token, {});
    const recent = [...rows].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, 5);
    return sendJson(res, 200, {
      summary: { total: rows.length, completed: rows.filter((row) => row.status === "확인 완료").length },
      recent: recent.map((row) => ({
        id: row.id,
        checklistType: row.checklist_type,
        templateId: row.template_id || "",
        checklistTitle: row.checklist_type ? CHECKLISTS[row.checklist_type].label : row.checklist_title,
        clientName: row.client_name,
        submittedAt: row.submitted_at,
      })),
    });
  }

  if (route === "/stats/templates") {
    const visible = TEMPLATES.filter((template) => ["active", "closed"].includes(template.status));
    return sendJson(res, 200, {
      templates: visible
        .map((template) => ({ id: template.id, title: template.title, status: template.status, scoringEnabled: template.scoringEnabled }))
        .sort((a, b) => a.title.localeCompare(b.title, "ko")),
    });
  }

  if (/^\/stats\/templates\/[^/]+$/.test(route)) {
    const template = findTemplate(route.split("/")[3]);
    if (!template || !["active", "closed"].includes(template.status)) return sendJson(res, 404, { message: "통계에서 볼 수 있는 설문 양식이 아닙니다." });
    return sendJson(res, 200, { template: statsTemplateView(template) });
  }

  if (route === "/stats") {
    const statsQuery = query.templateId ? { ...query, type: "" } : query;
    return sendJson(res, 200, { rows: statsRows(token, statsQuery), templateId: query.templateId || undefined, queriedAt: new Date().toISOString() });
  }

  if (route === "/submissions" && req.method === "GET") {
    const rows = filterSubmissions(token, query);
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 5000);
    const start = (page - 1) * limit;
    return sendJson(res, 200, {
      rows: rows.slice(start, start + limit),
      pagination: { page, limit, totalCount: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)), start: start + 1, end: Math.min(start + limit, rows.length) },
    });
  }

  if (route === "/submissions/export") {
    const rows = filterSubmissions(token, query);
    return sendJson(res, 200, { rows, totalCount: rows.length, truncated: false });
  }

  // Explicit local-only preview mode: edits live in memory and reset on restart.
  if (process.argv.includes('--submission-detail') && req.method === 'PATCH' && /^\/submissions\/[^/]+(?:\/(?:complete|reopen))?$/.test(route)) {
    if (token.role !== 'agency' || token.scope !== 'admin') return sendJson(res,403,{message:'기관담당자만 변경할 수 있습니다.'});
    const row=SUBMISSIONS.find(item=>item.id===route.split('/')[2] && item.institution_code===token.agencyCode && !item.deleted_at);
    if (!row) return sendJson(res,404,{message:'가상 제출건을 찾을 수 없습니다.'});
    for (const [key,column] of Object.entries({clientId:'client_id',workerName:'worker_name',workerPhone:'worker_phone',clientName:'client_name',clientGender:'client_gender',clientBirth:'client_birth'})) {
      if (Object.hasOwn(body,key)) row[column]=String(body[key] ?? '').trim();
    }
    if (route.endsWith('/complete') || route.endsWith('/reopen')) {
      const reopen=route.endsWith('/reopen');
      row.status=reopen?'확인 대기':'확인 완료';
      row.completed_at=reopen?null:new Date().toISOString();
      row.completed_by=reopen?null:token.agencyCode;
    }
    return sendJson(res,200,{submission:row});
  }

  if (/^\/submissions\/[^/]+$/.test(route) && req.method === "GET") {
    const id = route.split("/")[2];
    const row = SUBMISSIONS.find((item) => item.id === id);
    if (!row) return sendJson(res, 404, { message: "제출건을 찾을 수 없습니다." });
    return sendJson(res, 200, { submission: row });
  }

  if (route === "/home-templates") return sendJson(res, 200, { templates: [] });
  if (route === "/checklist-templates") return sendJson(res, 200, { templates: [] });
  if (route === "/checklist-templates/ai-status") {
    return sendJson(res, 200, { configured: false, connectionVerified: false, provider: "mock", model: "-", questionCount: { min: 3, max: 100 } });
  }

  if (req.method === "GET" && route === "/analysis/report/status") {
    if (MOCK_AGENCIES_WITHOUT_AI_KEY.includes(token.agencyCode)) {
      return sendJson(res, 200, { available: false, reason: "AI_KEY_NOT_CONFIGURED", message: "이 계정의 AI가 미설정이거나 사용 중지 상태입니다. AI 연동 설정을 확인해 주세요." });
    }
    return sendJson(res, 200, { available: true, provider: "mock", model: "mock-analysis (가짜 AI)" });
  }
  if (req.method === "POST" && route === "/analysis/report") {
    handleAnalysisReport(req, res, token, body);
    return undefined;
  }
  if (req.method === "POST" && route === "/analysis/recommend") {
    handleAnalysisRecommend(req, res, token, body);
    return undefined;
  }

  // ★ 분석 API — 실제 집계 코드를 그대로 사용한다.
  if (req.method === "POST" && route === "/analysis/run") {
    const specs = Array.isArray(body.specs) ? body.specs.slice(0, 8) : [];
    if (specs.length === 0) return sendJson(res, 400, { message: "분석 기준을 하나 이상 선택해 주세요." });
    if (!body.checklistType && !body.templateId) return sendJson(res, 400, { message: "분석할 설문지를 선택해 주세요." });

    const statusMode = body.status === "completed" ? "completed" : "all";
    const template = body.templateId ? findTemplate(body.templateId) : null;
    if (body.templateId && (!template || !["active", "closed"].includes(template.status))) {
      return sendJson(res, 404, { message: "통계에서 볼 수 있는 설문 양식이 아닙니다." });
    }
    const rows = filterSubmissions(token, {
      checklistType: template ? undefined : body.checklistType,
      templateId: template ? template.id : undefined,
      agencyCode: body.agencyCode,
      sido: body.sido,
      sigungu: body.sigungu,
      startDate: body.startDate,
      endDate: body.endDate,
      status: statusMode === "completed" ? "확인 완료" : undefined,
    });

    const records = normalizeSubmissions(rows);
    return sendJson(res, 200, {
      recordCount: records.length,
      statusMode,
      summary: summarize(records),
      itemRates: template
        ? itemRates(records, { primaryByQuestion: primaryLabelsFromTemplate(statsTemplateView(template)), builtinOrder: false })
        : itemRates(records),
      tables: specs.map((spec) => ({ spec, ...computeCrosstab(records, spec) })),
      filters: { checklistType: body.checklistType || null, templateId: body.templateId || null, startDate: body.startDate || null, endDate: body.endDate || null, sido: body.sido || null, sigungu: body.sigungu || null, agencyCode: body.agencyCode || null, status: statusMode },
    });
  }

  return sendJson(res, 200, {});
}

// ── 정적 파일 ─────────────────────────────────────────────────────────────────
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon" };

function serveStatic(res, pathname) {
  // Mirror the explicit production entry routes for local integration checks.
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(302, { Location: pathname === "/" ? "/landing#welcome" : "/admin" }).end();
    return;
  }
  const entry = { "/admin": "/index.html", "/landing": "/landing.html" };
  const relative = decodeURIComponent(entry[pathname] || pathname).replace(/^\/+/, "");
  const filePath = path.join(ROOT, relative);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("찾을 수 없습니다: " + relative);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    if (adminUxPreview && path.extname(filePath) === '.html') {
      data = data.toString().replace(/<body([^>]*)>/, '<body$1><div style="padding:10px 18px;background:#fff3cf;color:#594410;text-align:center;font:14px/1.6 sans-serif">로컬 UX 미리보기 · 모든 계정/응답/AI 연결은 합성 데이터입니다. 실제 비밀번호나 API 키를 입력하지 마세요.</div>');
    }
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (!url.pathname.startsWith("/api")) return serveStatic(res, url.pathname);

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return sendJson(res, 400, { message: "요청 본문을 읽지 못했습니다." });
      }
      try {
        handleApi(req, res, url, body);
      } catch (error) {
        sendJson(res, 500, { message: error.message || "가짜 서버 오류" });
      }
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`\n  가짜 API 서버 (운영 DB 미연결)  →  http://localhost:${PORT}`);
    console.log(`  가상 제출건 ${SUBMISSIONS.length}건 (기본 3종 ${BUILTIN_SUBMISSIONS.length} · 자체 설문 ${TEMPLATE_SUBMISSIONS.length}) · 가상 기관 ${AGENCIES.length}곳`);
    console.log(`  로그인:  MOCKCENTRAL / ${PASSWORD}   (전체 기관)`);
    console.log(`          MOCKAG001   / ${PASSWORD}   (본인 기관만)`);
    console.log(`  종료: Ctrl + C\n`);
  });
