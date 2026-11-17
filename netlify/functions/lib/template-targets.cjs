'use strict';
const fail = (statusCode, message) => Object.assign(new Error(message), {statusCode});
function readTargets(row) {
  return {mode: row.submission_target_mode || 'all', codes: row.submission_target_codes || [], revision: row.submission_target_revision || 0};
}
function allows(targets, institution) {
  return Boolean(institution && institution.active === true && institution.type === 'agency' &&
    (targets.mode === 'all' || (targets.mode === 'selected' && targets.codes.includes(institution.code))));
}
async function normalizeTargets(value, db, before = {mode:'all',codes:[],revision:0}) {
  if (value === undefined) return before;
  if (!value || !['all','selected'].includes(value.mode) || !Array.isArray(value.codes)) throw fail(400,'제출 대상 설정이 올바르지 않습니다.');
  if (!Number.isInteger(value.revision) || value.revision !== before.revision) throw fail(409,'제출 대상이 다른 창에서 변경되었습니다. 양식을 다시 열어 주세요.');
  if (value.codes.length > 10000) throw fail(400,'선택 기관은 최대 10,000개까지 지정할 수 있습니다.');
  if (value.codes.some(code => typeof code !== 'string' || !/^[A-Z0-9]+$/.test(code))) throw fail(400,'제출 대상 기관코드가 올바르지 않습니다.');
  const codes = [...new Set(value.codes)].sort();
  if (value.mode === 'all' && codes.length) throw fail(400,'전체 기관 선택 시 개별 기관 목록은 비워 주세요.');
  if (value.mode === 'selected' && !codes.length) throw fail(400,'제출 대상 기관을 최소 1개 선택해 주세요.');
  for (let i = 0; i < codes.length; i += 100) {
    const batch = codes.slice(i,i+100);
    const rows = await db(`institutions?code=in.(${batch.join(',')})&select=code,type,active`);
    for (const code of batch) {
      const row = rows.find(item => item.code === code);
      if (!row || row.type !== 'agency' || (!row.active && !before.codes.includes(code))) throw fail(400,`제출 대상으로 지정할 수 없는 기관입니다: ${code}`);
    }
  }
  return {mode:value.mode,codes,revision:before.revision};
}
function targetColumns(targets) {
  return {submission_target_mode:targets.mode, submission_target_codes:targets.codes};
}
module.exports = {readTargets, allows, normalizeTargets, targetColumns};
