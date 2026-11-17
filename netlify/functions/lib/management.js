// Integer scores match question_options.score. Intervals are inclusive.
function scoreRange(questions) {
  return questions.reduce((range, q) => {
    if (!['single_choice', 'multiple_choice'].includes(q.answerType)) return range;
    const scores = q.options.map(o => Number(o.score));
    if (!scores.length || scores.some(s => !Number.isInteger(s))) throw new Error('선택지 배점을 확인해 주세요.');
    let min, max;
    if (q.answerType === 'multiple_choice') {
      min = scores.filter(s => s < 0).reduce((a,b) => a+b, 0);
      max = scores.filter(s => s > 0).reduce((a,b) => a+b, 0);
      if (q.required && min === 0) min = Math.min(...scores);
      if (q.required && max === 0) max = Math.max(...scores);
    } else {
      min = Math.min(...scores); max = Math.max(...scores);
    }
    return {min: range.min + (q.required ? min : Math.min(0,min)), max: range.max + (q.required ? max : Math.max(0,max))};
  }, {min:0,max:0});
}

function normalizeManagement(input, questions) {
  if (!input.managementEnabled) return {managementEnabled:false, managementBands:[]};
  if (!input.scoringEnabled) throw new Error('관리구분을 사용하려면 선택지별 점수를 사용해야 합니다.');
  if (!questions.some(q => ['single_choice','multiple_choice'].includes(q.answerType))) throw new Error('관리구분에는 점수형 문항이 필요합니다.');
  if (!Array.isArray(input.managementBands) || !input.managementBands.length || input.managementBands.length > 20) throw new Error('관리 구간은 1~20개로 설정해 주세요.');
  const bands = input.managementBands.map(b => ({name:String(b.name || '').trim(),min:b.min,max:b.max}));
  for (const b of bands) {
    if (!b.name || b.name.length > 50 || !Number.isInteger(b.min) || !Number.isInteger(b.max) || b.min > b.max) throw new Error('구간명과 정수 최소·최대 점수를 확인해 주세요.');
  }
  if (new Set(bands.map(b => b.name)).size !== bands.length) throw new Error('관리 구간명은 중복될 수 없습니다.');
  bands.sort((a,b) => a.min-b.min);
  const range = scoreRange(questions);
  if (bands[0].min !== range.min || bands.at(-1).max !== range.max) throw new Error(`관리 구간은 총점 범위 ${range.min}~${range.max}점을 모두 포함해야 합니다.`);
  for (let i=1;i<bands.length;i++) if (bands[i].min !== bands[i-1].max+1) throw new Error('관리 구간에 중복 또는 누락된 점수가 있습니다.');
  return {managementEnabled:true,managementBands:bands};
}

function classify(template, total) {
  if (!template.managementEnabled) return null;
  const band = template.managementBands.find(b => total >= b.min && total <= b.max);
  if (!band) throw new Error('총점에 해당하는 관리 구간이 없습니다. 양식 설정을 확인해 주세요.');
  return band.name;
}
module.exports = {scoreRange, normalizeManagement, classify};
