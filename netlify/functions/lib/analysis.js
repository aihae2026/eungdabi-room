"use strict";

// DB(Supabase)에서 꺼낸 제출건 행 → 교차 집계 함수(crosstab.js)가 쓰는 record 배열로 변환하고,
// 요약 숫자·문항별 응답률을 계산한다. 네트워크에 의존하지 않는 순수 함수 모음.

// 문항별 "대표 응답" = 위험·해당을 뜻하는 쪽 응답. 심한 쪽부터 찾아 첫 번째로 존재하는 것을 쓴다.
// (우울 척도처럼 보기가 빈도인 경우 "없음" 이 가장 많아도 그것을 대표로 삼지 않는다.)
const PRIMARY_ANSWER_ORDER = ["예", "네", "거의 매일", "7일 이상", "2~3일 이상", "매우 그렇다", "그렇다"];

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "1945-02-04" 같은 생년월일 + 조사일자 → 만 나이(대략). 비정상 값은 null.
function ageFromBirth(birth, surveyDate) {
  const b = String(birth || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b) return null;
  const birthYear = Number(b[1]);
  const surveyYear = Number(String(surveyDate || "").slice(0, 4)) || new Date().getFullYear();
  const age = surveyYear - birthYear;
  return age >= 40 && age <= 120 ? age : null; // 노인 대상 조사 기준 범위 밖이면 제외
}

// 응답 1개 → 집계에 쓸 값. 문자열(한 칸) · 배열(복수 선택) · null(집계하지 않음).
//   - 기본 3종 설문: answer_label 이 곧 보기 이름이다.
//   - 자체 설문 선택형: answer_value.labels 가 고른 보기 이름들이다. answer_label 에는
//     '기타: 직접 쓴 내용' 처럼 입력 내용이 붙어 있어 사람마다 다른 칸이 되고 개인정보가
//     표에 드러날 수 있으므로 쓰지 않는다.
//   - 자체 설문 서술형: answer_value.text. 문장마다 다르고 개인정보가 섞일 수 있어 집계하지 않는다.
function answerForAnalysis(answer) {
  const value = answer.answer_value ?? answer.answerValue;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(value.labels)) {
      const labels = [...new Set(value.labels.map((label) => String(label ?? "").trim()).filter(Boolean))];
      if (labels.length === 0) return null;
      return labels.length === 1 ? labels[0] : labels;
    }
    if ("text" in value) return null;
  }
  const label = answer.answer_label ?? answer.answerLabel ?? "";
  return label === "" || label == null ? null : String(label);
}

// 제출건 1건 → record 1개
function normalizeSubmission(row) {
  const answers = {};
  for (const a of row.submission_answers || []) {
    const qno = String(a.question_no ?? a.questionNo ?? "");
    const value = answerForAnalysis(a);
    if (qno && value !== null) answers[qno] = value;
  }
  return {
    score: toNumber(row.total_score),
    age: ageFromBirth(row.client_birth, row.survey_date),
    gender: row.client_gender || row.clientGender || "",
    institution: row.institution_code || row.institutionCode || "",
    institutionName: row.institution_name || row.institutions?.name || "",
    sido: row.sido || row.institutions?.sido || "",
    sigungu: row.sigungu || row.institutions?.sigungu || "",
    status: row.status || "",
    month: String(row.survey_date || "").slice(0, 7),
    answers,
  };
}

function normalizeSubmissions(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeSubmission);
}

function median(sortedNumbers) {
  const n = sortedNumbers.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedNumbers[mid] : (sortedNumbers[mid - 1] + sortedNumbers[mid]) / 2;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// 요약 숫자
function summarize(records) {
  const scores = records.map((r) => r.score).filter((v) => v != null).sort((a, b) => a - b);
  const statusCounts = {};
  for (const r of records) statusCounts[r.status || "(없음)"] = (statusCounts[r.status || "(없음)"] || 0) + 1;
  return {
    n: records.length,
    withScore: scores.length,
    meanScore: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    medianScore: scores.length ? median(scores) : null,
    minScore: scores.length ? scores[0] : null,
    maxScore: scores.length ? scores[scores.length - 1] : null,
    institutionCount: new Set(records.map((r) => r.institution).filter(Boolean)).size,
    ageKnown: records.filter((r) => r.age != null).length,
    // 아래 두 값은 STEP 2 의 분석 기준 추천에서 "이 기준이 이 데이터에 쓸모 있는지" 판단에 쓴다.
    genderKnown: records.filter((r) => r.gender).length,
    monthCount: new Set(records.map((r) => r.month).filter(Boolean)).size,
    statusCounts,
  };
}

// 문항별 응답 분포 + 대표 응답률. 대표 응답률 높은 순으로 정렬.
//   - 비율의 분모는 "그 문항에 응답한 사람 수"다. 복수 선택 문항은 보기별 비율 합이 100%를 넘을 수 있다.
//   - 대표 응답: options.primaryByQuestion(자체 설문의 배점 가장 높은 보기) →
//     기본 3종의 위험 쪽 응답 순서(options.builtinOrder, 기본 켬) → 가장 많이 나온 응답.
function itemRates(records, options = {}) {
  const primaryByQuestion = options.primaryByQuestion || {};
  const builtinOrder = options.builtinOrder !== false;
  const byQ = new Map();
  const respondents = new Map();
  const multiQuestions = new Set();
  for (const r of records) {
    for (const [qno, raw] of Object.entries(r.answers)) {
      const labels = [...new Set(Array.isArray(raw) ? raw : [raw])];
      if (labels.length === 0) continue;
      if (labels.length > 1) multiQuestions.add(qno);
      if (!byQ.has(qno)) byQ.set(qno, new Map());
      const m = byQ.get(qno);
      labels.forEach((label) => m.set(label, (m.get(label) || 0) + 1));
      respondents.set(qno, (respondents.get(qno) || 0) + 1);
    }
  }
  const rows = [];
  for (const [qno, m] of byQ) {
    const total = respondents.get(qno) || 0;
    const distribution = [...m.entries()]
      .map(([label, count]) => ({ label, count, pct: total ? round1((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    const preferred = primaryByQuestion[qno];
    const primaryLabel =
      (preferred && m.has(preferred) ? preferred : "") ||
      (builtinOrder ? PRIMARY_ANSWER_ORDER.find((label) => m.has(label)) : "") ||
      distribution[0]?.label ||
      "";
    const primaryCount = m.get(primaryLabel) || 0;
    rows.push({
      questionNo: qno,
      total,
      multi: multiQuestions.has(qno),
      primaryLabel,
      primaryRate: total ? round1((primaryCount / total) * 100) : 0,
      distribution,
    });
  }
  return rows.sort((a, b) => b.primaryRate - a.primaryRate || Number(a.questionNo) - Number(b.questionNo));
}

// 자체 설문의 대표 응답 = 선택형 문항에서 배점이 가장 높은 보기. 배점을 쓰지 않는 양식이면 비워 둔다.
function primaryLabelsFromTemplate(template) {
  if (!template || !template.scoringEnabled) return {};
  const out = {};
  for (const question of template.questions || []) {
    if (!["single_choice", "multiple_choice"].includes(question.answerType)) continue;
    const best = (question.options || [])
      .filter((option) => Number.isFinite(Number(option.score)))
      .sort((a, b) => Number(b.score) - Number(a.score))[0];
    if (best && Number(best.score) > 0) out[String(question.questionNo)] = best.optionText;
  }
  return out;
}

module.exports = { normalizeSubmission, normalizeSubmissions, summarize, itemRates, ageFromBirth, median, answerForAnalysis, primaryLabelsFromTemplate };
