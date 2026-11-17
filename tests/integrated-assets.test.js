const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m => m[1]);
test('통합 HTML에 충돌 마커와 중복 스크립트가 없다', () => {
  assert.doesNotMatch(html,/^(<<<<<<<|=======|>>>>>>>)/m);
  assert.equal(new Set(scripts.map(s => s.split('?')[0])).size,scripts.length);
});
test('양쪽 신규 스크립트와 의존성 로딩 순서를 유지한다', () => {
  const before = (a,b) => {
    const ai=scripts.findIndex(s=>s.split('?')[0]===a.split('?')[0]), bi=scripts.findIndex(s=>s.split('?')[0]===b.split('?')[0]);
    assert.ok(ai>=0 && bi>=0 && ai<bi,`${a} before ${b}`);
  };
  before('assets/v8-form-validation.js?v=recovery1','assets/app.js?v=recovery1');
  before('assets/app.js?v=recovery1','assets/ai-status-workspace.js?v=recovery1');
  before('assets/ai-settings-state.js?v=recovery1','assets/ai-status-workspace.js?v=recovery1');
  before('assets/eungdabiroom-v8.js?v=recovery1','assets/v8-workspace.js?v=recovery1');
  before('assets/v8-data.js?v=r10','assets/v8-workspace.js?v=recovery1');
});
test('양쪽 최신 스타일을 유지하고 모든 참조 파일이 존재한다', () => {
  assert.match(html,/assets\/v8-workspace\.css\?v=[\w-]+/);
  assert.match(html,/assets\/v8-ai-settings\.css\?v=[\w-]+/);
  const assets=[...scripts,...[...html.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map(m=>m[1])];
  for(const asset of assets) assert.ok(fs.existsSync(path.join(root,asset.split('?')[0])),asset);
});
test('운영 HTML에 합성 AI 설정 어댑터를 포함하지 않는다', () => {
  assert.doesNotMatch(html,/ai-settings-demo|review-ai-demo|github-bridge/);
});
