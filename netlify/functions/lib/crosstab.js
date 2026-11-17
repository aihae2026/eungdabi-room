"use strict";

// 설문 제출 결과를 행 × 열 교차표로 집계하는 순수 함수.
// DB·네트워크에 의존하지 않으므로 단위 테스트가 쉽다.
//
// record 형태:
//   { score:Number|null, age:Number|null, gender:String, institution:String,
//     institutionName:String, sido:String, sigungu:String, status:String,
//     month:String, answers:{ [questionNo]:String } }
//
// dimension(dim) 형태 — 행/열 각각:
//   { kind:"all", label? }
//   { kind:"number_bins", field:"score"|"age", boundaries:[..], labels?, unit? }
//   { kind:"attribute", field:"gender"|"institution"|"sido"|"sigungu"|"status", labels? }
//   { kind:"question", questionNo:String, labels? }
//   { kind:"month" }
//
// 복수 선택 문항: answers[questionNo] 가 배열이면 한 사람이 그 축의 여러 칸에 들어간다.
//   - rowTotals / colTotals / grandTotal 은 "칸 합"이 아니라 "응답자 수"(중복 없이)다.
//   - pct 는 행의 응답자 대비다. 그래서 복수 선택 열이 있으면 한 행의 비율 합이 100%를 넘을 수 있다.
//   - 결과에 rowMulti / colMulti 로 그 축에 실제로 여러 칸에 걸친 응답자가 있었는지 알려 준다.
//   단일 선택만 있을 때는 예전과 결과가 완전히 같다.

const ANSWER_ORDER = ["예", "아니오", "미해당", "없음", "네", "2~3일 이상", "7일 이상", "거의 매일"];
const STATUS_ORDER = ["확인 대기", "확인 완료"];

// 차원 값은 없음(null) · 하나(문자열) · 여럿(배열) 중 하나다. 항상 목록으로 다룬다.
function toLabelList(value) {
  if (value === null || value === undefined || value === "") return [];
  return Array.isArray(value) ? value.filter((label) => label !== null && label !== undefined && label !== "") : [value];
}

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_ANALYSIS_SPEC';
  throw error;
}

function validateDimension(dim) {
  if (!dim || typeof dim !== 'object' || Array.isArray(dim)) invalid('분석 차원은 객체여야 합니다.');
  if (!['all', 'number_bins', 'attribute', 'question', 'month'].includes(dim.kind)) invalid('지원하지 않는 분석 유형입니다.');
  const out = {...dim};
  if (dim.labels !== undefined) {
    if (!Array.isArray(dim.labels) || dim.labels.some(x => typeof x !== 'string' || !x.trim())) invalid('구간 이름은 공란이 아닌 문자열 배열이어야 합니다.');
    out.labels = dim.labels.map(x => x.trim());
    if (new Set(out.labels).size !== out.labels.length) invalid('구간 이름이 중복되었습니다. 서로 다른 이름을 입력해 주세요.');
  }
  if (dim.kind === 'number_bins') {
    if (!['score', 'age'].includes(dim.field)) invalid('숫자 구간 필드는 score 또는 age여야 합니다.');
    if (!Array.isArray(dim.boundaries) || dim.boundaries.some(x => typeof x !== 'number' || !Number.isSafeInteger(x))) invalid('구간 경계값은 정수 배열이어야 합니다.');
    out.boundaries = normalizeBounds(dim.boundaries);
    if (out.labels && out.labels.length !== out.boundaries.length + 1) invalid('구간 이름 개수가 실제 구간 개수와 일치하지 않습니다.');
    if (dim.unit !== undefined && typeof dim.unit !== 'string') invalid('구간 단위는 문자열이어야 합니다.');
  }
  if (dim.kind === 'attribute' && !['gender', 'institution', 'sido', 'sigungu', 'status'].includes(dim.field)) invalid('지원하지 않는 속성 필드입니다.');
  if (dim.kind === 'question') {
    if (!['string', 'number'].includes(typeof dim.questionNo) || !/^[1-9]\d*$/.test(String(dim.questionNo)) || !Number.isSafeInteger(Number(dim.questionNo))) invalid('문항 번호는 양의 정수여야 합니다.');
  }
  if (dim.kind === 'all' && dim.label !== undefined) {
    if (typeof dim.label !== 'string' || !dim.label.trim()) invalid('전체 구간 이름은 공란일 수 없습니다.');
    out.label = dim.label.trim();
  }
  return out;
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) invalid('분석 기준은 객체여야 합니다.');
  if (spec.cells !== undefined && (!Array.isArray(spec.cells) || spec.cells.some(x => !['count', 'pct', 'mean'].includes(x)))) invalid('지원하지 않는 집계 방식입니다.');
  return {...spec, row: validateDimension(spec.row), col: validateDimension(spec.col)};
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// 주어진 값이 정렬된 경계 목록의 몇 번째 구간에 들어가는지 (0 .. bounds.length).
function binIndex(value, bounds) {
  let i = 0;
  while (i < bounds.length && value >= bounds[i]) i += 1;
  return i;
}

// 경계 목록 → 구간 이름 (정수·정수 경계 가정).
// 중복·미정렬 경계는 정리한다. (경계 [20,20,40] → 구간 3개)
function normalizeBounds(bounds) {
  return [...new Set((bounds || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

function binLabels(bounds, unit) {
  const u = unit || "";
  const b = normalizeBounds(bounds);
  if (b.length === 0) return ["전체"];
  const labels = [`${b[0] - 1}${u} 이하`];
  for (let i = 1; i < b.length; i += 1) {
    labels.push(`${b[i - 1]}–${b[i] - 1}${u}`);
  }
  labels.push(`${b[b.length - 1]}${u} 이상`);
  return labels;
}

// 선호 순서를 앞에, 나머지는 사전순으로.
function orderLabels(present, preferred) {
  const pref = Array.isArray(preferred) ? preferred : [];
  const head = pref.filter((label) => present.includes(label));
  const tail = present.filter((label) => !pref.includes(label)).sort();
  return [...head, ...tail];
}

// dim → { labels:[...], assign:(record) => label|null }
function buildDimension(dim, records) {
  dim = validateDimension(dim);
  const kind = dim && dim.kind;

  if (kind === "all") {
    const label = dim.label || "전체";
    return { labels: [label], assign: () => label };
  }

  if (kind === "number_bins") {
    const field = dim.field === "age" ? "age" : "score";
    const bounds = normalizeBounds(dim.boundaries);
    const unit = dim.unit != null ? dim.unit : field === "age" ? "세" : "점";
    const labels =
      dim.labels && dim.labels.length === bounds.length + 1
        ? dim.labels.slice()
        : binLabels(bounds, unit);
    return {
      labels,
      assign(record) {
        const value = record[field];
        if (value === null || value === undefined) return null;
        return labels[binIndex(value, bounds)];
      },
    };
  }

  if (kind === "question") {
    const qno = String(dim.questionNo);
    const present = new Set();
    records.forEach((record) => {
      toLabelList(record.answers && record.answers[qno]).forEach((answer) => present.add(answer));
    });
    return {
      labels: orderLabels(Array.from(present), dim.labels || ANSWER_ORDER),
      assign(record) {
        // 복수 선택이면 배열을 그대로 돌려준다 (computeCrosstab 이 칸마다 나눠 담는다).
        return (record.answers && record.answers[qno]) || null;
      },
    };
  }

  if (kind === "attribute") {
    const field = dim.field;
    const present = new Set();
    records.forEach((record) => {
      const value = record[field];
      if (value !== null && value !== undefined && value !== "") present.add(String(value));
    });
    const preferred = field === "status" ? STATUS_ORDER : dim.labels;
    return {
      labels: orderLabels(Array.from(present), preferred),
      assign(record) {
        const value = record[field];
        return value === null || value === undefined || value === "" ? null : String(value);
      },
    };
  }

  if (kind === "month") {
    const present = new Set();
    records.forEach((record) => {
      if (record.month) present.add(record.month);
    });
    return {
      labels: Array.from(present).sort(),
      assign(record) {
        return record.month || null;
      },
    };
  }

  throw new Error(`알 수 없는 차원 종류: ${kind}`);
}

// 교차표 계산. 반환:
//   { rowLabels, colLabels, cells:[row][col]{count,pct?,mean?},
//     rowTotals, colTotals, grandTotal, droppedRecords, metrics }
function computeCrosstab(records, spec) {
  if (!Array.isArray(records)) throw new Error("records 는 배열이어야 합니다.");
  if (!spec || !spec.row || !spec.col) throw new Error("spec.row 와 spec.col 이 필요합니다.");
  spec = validateSpec(spec);

  const metrics = Array.isArray(spec.cells) && spec.cells.length ? spec.cells : ["count", "pct"];
  const rowDim = buildDimension(spec.row, records);
  const colDim = buildDimension(spec.col, records);
  const rowIndex = new Map(rowDim.labels.map((label, i) => [label, i]));
  const colIndex = new Map(colDim.labels.map((label, i) => [label, i]));

  const buckets = rowDim.labels.map(() => colDim.labels.map(() => []));
  // 행·열마다 "몇 명이 들어왔는지"를 사람 기준(중복 없이)으로 센다.
  const rowPeople = rowDim.labels.map(() => new Set());
  const colPeople = colDim.labels.map(() => new Set());
  let droppedRecords = 0;
  let placedRecords = 0;
  let rowMulti = false;
  let colMulti = false;

  records.forEach((record, recordIndex) => {
    const rowLabels = [...new Set(toLabelList(rowDim.assign(record)))].filter((label) => rowIndex.has(label));
    const colLabels = [...new Set(toLabelList(colDim.assign(record)))].filter((label) => colIndex.has(label));
    if (rowLabels.length === 0 || colLabels.length === 0) {
      droppedRecords += 1;
      return;
    }
    placedRecords += 1;
    if (rowLabels.length > 1) rowMulti = true;
    if (colLabels.length > 1) colMulti = true;
    rowLabels.forEach((rowLabel) => {
      const ri = rowIndex.get(rowLabel);
      rowPeople[ri].add(recordIndex);
      colLabels.forEach((colLabel) => {
        const ci = colIndex.get(colLabel);
        colPeople[ci].add(recordIndex);
        buckets[ri][ci].push(record);
      });
    });
  });

  const rowTotals = rowPeople.map((people) => people.size);
  const colTotals = colPeople.map((people) => people.size);
  const grandTotal = placedRecords;

  const cells = buckets.map((cols, ri) =>
    cols.map((cell) => {
      const out = { count: cell.length };
      if (metrics.includes("pct")) {
        out.pct = rowTotals[ri] ? round1((cell.length / rowTotals[ri]) * 100) : 0;
      }
      if (metrics.includes("mean")) {
        const scores = cell
          .map((record) => record.score)
          .filter((value) => value !== null && value !== undefined);
        out.mean = scores.length
          ? round1(scores.reduce((sum, value) => sum + value, 0) / scores.length)
          : null;
      }
      return out;
    })
  );

  return {
    rowLabels: rowDim.labels,
    colLabels: colDim.labels,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    droppedRecords,
    metrics,
    rowMulti,
    colMulti,
  };
}

module.exports = { computeCrosstab, buildDimension, binLabels, orderLabels, binIndex, normalizeBounds, validateSpec };
