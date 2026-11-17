const test = require("node:test");
const assert = require("node:assert/strict");
const { computeCrosstab, buildDimension, binLabels, orderLabels, binIndex, normalizeBounds } = require("../netlify/functions/lib/crosstab.js");

function rec(score, age, gender, institution, sido, status, month, answers) {
  return { score, age, gender, institution, institutionName: institution, sido, sigungu: sido, status, month, answers };
}

// 점수 없음(#7)을 포함한 8건. 손 계산과 대조하기 쉬운 작은 표본.
const R = [
  rec(10, 72, "여", "A", "서울", "확인 완료", "2026-09", { 9: "아니오" }),
  rec(25, 78, "여", "A", "서울", "확인 완료", "2026-09", { 9: "예" }),
  rec(40, 82, "남", "A", "서울", "확인 대기", "2026-09", { 9: "예" }),
  rec(55, 88, "여", "B", "부산", "확인 완료", "2026-08", { 9: "예" }),
  rec(15, 69, "남", "B", "부산", "확인 대기", "2026-08", { 9: "아니오" }),
  rec(35, 91, "여", "B", "부산", "확인 완료", "2026-09", { 9: "미해당" }),
  rec(60, 85, "여", "C", "부산", "확인 완료", "2026-09", { 9: "예" }),
  rec(null, 80, "남", "C", "부산", "확인 완료", "2026-09", { 9: "아니오" }),
];

test("연령대 x 총점 구간 — 인원과 행 대비 비율", () => {
  const out = computeCrosstab(R, {
    row: { kind: "number_bins", field: "age", boundaries: [75, 85] },
    col: { kind: "number_bins", field: "score", boundaries: [20, 40] },
    cells: ["count", "pct"],
  });
  assert.deepEqual(out.rowLabels, ["74세 이하", "75–84세", "85세 이상"]);
  assert.deepEqual(out.colLabels, ["19점 이하", "20–39점", "40점 이상"]);
  assert.deepEqual(out.cells[0].map((c) => c.count), [2, 0, 0]);
  assert.deepEqual(out.cells[1].map((c) => c.count), [0, 1, 1]);
  assert.deepEqual(out.cells[2].map((c) => c.count), [0, 1, 2]);
  assert.deepEqual(out.rowTotals, [2, 2, 3]);
  assert.equal(out.grandTotal, 7);
  assert.equal(out.droppedRecords, 1); // 점수 없는 #7 은 총점 구간에 못 들어감
  assert.equal(out.cells[0][0].pct, 100);
  assert.equal(out.cells[2][1].pct, 33.3);
  assert.equal(out.cells[2][2].pct, 66.7);
});

test("총점 구간 x 문항 응답 — 열이 문항 응답인 경우", () => {
  const out = computeCrosstab(R, {
    row: { kind: "number_bins", field: "score", boundaries: [20, 40] },
    col: { kind: "question", questionNo: "9" },
    cells: ["count"],
  });
  assert.deepEqual(out.colLabels, ["예", "아니오", "미해당"]); // 선호 순서 우선
  assert.deepEqual(out.cells[0].map((c) => c.count), [0, 2, 0]);
  assert.deepEqual(out.cells[1].map((c) => c.count), [1, 0, 1]);
  assert.deepEqual(out.cells[2].map((c) => c.count), [3, 0, 0]);
});

test("성별 x 전체 — 전체 1열", () => {
  const out = computeCrosstab(R, {
    row: { kind: "attribute", field: "gender" },
    col: { kind: "all" },
    cells: ["count"],
  });
  assert.deepEqual(out.rowLabels, ["남", "여"]);
  assert.deepEqual(out.colLabels, ["전체"]);
  assert.equal(out.cells[0][0].count, 3);
  assert.equal(out.cells[1][0].count, 5);
  assert.equal(out.droppedRecords, 0);
});

test("처리 상태 x 총점 구간 — 상태는 대기·완료 순서 고정", () => {
  const out = computeCrosstab(R, {
    row: { kind: "attribute", field: "status" },
    col: { kind: "number_bins", field: "score", boundaries: [20, 40] },
    cells: ["count"],
  });
  assert.deepEqual(out.rowLabels, ["확인 대기", "확인 완료"]);
  assert.deepEqual(out.cells[0].map((c) => c.count), [1, 0, 1]);
  assert.deepEqual(out.cells[1].map((c) => c.count), [1, 2, 2]);
});

test("경계값 0개면 구간(열)이 1개", () => {
  const out = computeCrosstab(R, {
    row: { kind: "attribute", field: "sido" },
    col: { kind: "number_bins", field: "score", boundaries: [] },
    cells: ["count"],
  });
  assert.deepEqual(out.colLabels, ["전체"]);
  assert.deepEqual(out.rowLabels, ["부산", "서울"]);
  assert.equal(out.cells[0][0].count, 4); // 부산 5건 중 점수 있는 4건
  assert.equal(out.cells[1][0].count, 3);
});

test("구간 이름을 직접 지정할 수 있다", () => {
  const out = computeCrosstab(R, {
    row: { kind: "all" },
    col: { kind: "number_bins", field: "score", boundaries: [20, 40], labels: ["저", "중", "고"] },
    cells: ["count"],
  });
  assert.deepEqual(out.colLabels, ["저", "중", "고"]);
});

test("셀 값으로 평균 총점을 낼 수 있다", () => {
  const out = computeCrosstab(R, {
    row: { kind: "all" },
    col: { kind: "attribute", field: "gender" },
    cells: ["count", "mean"],
  });
  assert.equal(out.cells[0][0].mean, 27.5); // 남: (40+15)/2, 점수 없는 1건 제외
  assert.equal(out.cells[0][1].mean, 37); // 여: (10+25+55+35+60)/5
});

test("binLabels — 경계 목록을 구간 이름으로", () => {
  assert.deepEqual(binLabels([20, 40], "점"), ["19점 이하", "20–39점", "40점 이상"]);
  assert.deepEqual(binLabels([75, 85], "세"), ["74세 이하", "75–84세", "85세 이상"]);
  assert.deepEqual(binLabels([50], "점"), ["49점 이하", "50점 이상"]);
  assert.deepEqual(binLabels([], "점"), ["전체"]);
});

test("중복·미정렬 경계값은 정리한다 (스트레스 테스트에서 발견)", () => {
  assert.deepEqual(normalizeBounds([40, 20, 20, 60]), [20, 40, 60]);
  assert.deepEqual(binLabels([20, 20, 40], "점"), ["19점 이하", "20–39점", "40점 이상"]);
  // 사분위가 모두 같은 값이어도 열이 중복되지 않는다
  const out = computeCrosstab(R, {
    row: { kind: "all" },
    col: { kind: "number_bins", field: "score", boundaries: [30, 30, 30] },
    cells: ["count"],
  });
  assert.deepEqual(out.colLabels, ["29점 이하", "30점 이상"]);
  assert.equal(new Set(out.colLabels).size, out.colLabels.length);
});

test("binIndex — 값이 몇 번째 구간인지", () => {
  assert.equal(binIndex(15, [20, 40]), 0);
  assert.equal(binIndex(20, [20, 40]), 1);
  assert.equal(binIndex(39, [20, 40]), 1);
  assert.equal(binIndex(40, [20, 40]), 2);
});

test("orderLabels — 선호 순서를 앞에, 나머지는 사전순", () => {
  assert.deepEqual(orderLabels(["미해당", "예", "기타"], ["예", "아니오", "미해당"]), ["예", "미해당", "기타"]);
  assert.deepEqual(orderLabels(["여", "남"], []), ["남", "여"]);
});

test("잘못된 입력은 예외를 던진다", () => {
  assert.throws(() => computeCrosstab("배열아님", { row: { kind: "all" }, col: { kind: "all" } }));
  assert.throws(() => computeCrosstab([], { row: { kind: "all" } }));
  assert.throws(() => buildDimension({ kind: "없는종류" }, []));
});
