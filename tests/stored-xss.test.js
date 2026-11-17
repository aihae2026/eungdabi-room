const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '../netlify/functions/api-legacy.cjs'), 'utf8');
function fn(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}
function context(source, names, globals = {}) {
  const ctx = vm.createContext(globals);
  vm.runInContext(names.map(n => fn(source, n)).join('\n'), ctx);
  return ctx;
}
const attack = '<img src=x onerror="globalThis.XSS=1"> & \'quoted\'';
test('detail text and wide-scope personal information are escaped once', () => {
  const c = context(app, ['escapeMarkup', 'escapeAttribute', 'detailRow', 'renderBasicInfoSection'], {isWideScopeRole: () => true});
  const item = Object.fromEntries(['workerName','workerPhone','clientName','clientGender','clientBirth','clientId','date'].map(k => [k, attack]));
  const html = c.renderBasicInfoSection(item, {name: attack, code: attack});
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('&amp;lt;'));
  assert.ok(c.detailRow('상태', '<span>정상</span>', true).includes('<span>정상</span>'));
});
test('institution option text and attributes cannot break out of their markup', () => {
  const select = {value: '', innerHTML: ''};
  const c = context(app, ['escapeMarkup','escapeAttribute','refreshInstitutionParentOptions','masterInstitutionActions'], {
    $: () => select, activeRegionalInstitutions: () => [{code: attack, name: attack}], canManageInstitution: () => true,
  });
  c.refreshInstitutionParentOptions();
  assert.ok(!select.innerHTML.includes('<img'));
  assert.ok(select.innerHTML.includes('&quot;'));
  const html = c.masterInstitutionActions({code: attack, name: attack, active: true});
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
test('recent names, memo and statistics options encode untrusted values at output', () => {
  for (const expression of ['escapeMarkup(item.clientName || "-")','escapeMarkup(item.memo)','escapeMarkup(checklistDefOf(item).label)','escapeAttribute(item.id)','escapeMarkup(item.name)']) assert.ok(app.includes(expression), expression);
  assert.ok(!app.includes('<p class="memo">${item.memo}</p>'));
});
function serverContext() {
  return context(api, ['required','isValidDateText','validPersonName','validPhoneNumber','validateSubmissionPersonalInfo','createSubmission'], {
    httpError: (status, message) => Object.assign(new Error(message), {status}),
    assertIntakeOrAdmin: () => {}, validUuid: x => x, loadChecklistTemplate: async () => ({}),
    assertChecklistSubmissionTarget: async () => {}, normalizeDynamicAnswers: async () => [],
    classify: () => '', audit: async () => {}, mapSubmission: x => x,
  });
}
const valid = {templateId:'fixture', workerName:'가상조사자', workerPhone:'010-0000-0000', clientName:'가상대상자', clientGender:'여', clientBirth:'1950-01-01', fieldMemo:'일반 메모'};
test('create rejects invalid fields before writing any submission', async () => {
  const c = serverContext();
  let writes = 0;
  c.supabase = async () => {writes++; return [{id:'fixture'}];};
  for (const bad of [{workerName:attack},{clientName:attack},{workerName:{}},{workerPhone:attack},{workerPhone:123},{clientGender:'기타'},{clientBirth:'2026-02-30'},{fieldMemo:{}},{fieldMemo:'x'.repeat(2001)}]) {
    await assert.rejects(c.createSubmission({agencyCode:'FIXTURE'}, {...valid,...bad}), e => e.status === 400);
  }
  assert.equal(writes, 0);
});
test('create preserves normal fields, raw memo and institution ownership; accepts memo boundary', async () => {
  const c = serverContext();
  assert.equal(c.validPhoneNumber('01000000000', '전화번호'), '010-0000-0000');
  for (const memo of ['', attack, 'x'.repeat(2000)]) {
    const writes = [];
    c.supabase = async (table, options) => {const body=JSON.parse(options.body); writes.push({table,body}); return [{id:'fixture',...body}];};
    await c.createSubmission({agencyCode:'FIXTURE'}, {...valid, fieldMemo:memo});
    assert.equal(writes[0].body.institution_code, 'FIXTURE');
    assert.equal(writes[0].body.worker_name, valid.workerName);
    assert.equal(writes[0].body.field_memo, memo);
    assert.equal(writes.length, 2);
  }
});
