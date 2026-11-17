const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/app.js'), 'utf8');
function setup(overrides = {}) {
  const context = {
    institutionMaster: [
      {code:'R1', name:'서울광역', sido:'서울', type:'regional', active:true},
      {code:'R2', name:'부산광역', sido:'부산', type:'regional', active:false},
      {code:'A1', name:'하위기관', type:'agency', parentCode:'R1', active:true},
      {code:'A2', name:'미지정기관', type:'agency', parentCode:'missing', active:true},
    ],
    masterRegionsInitialized:false, expandedMasterRegions:new Set(),
    masterAgencySearchTerm:'', masterStateFilter:'all', masterLevelFilter:'regional',
    escapeMarkup:value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    masterAgencyButton:o => `<button data-child="${o.code}">${o.name}</button>`,
    ...overrides,
  };
  context.matchesMasterState = o => context.masterStateFilter === 'all' || o.active === (context.masterStateFilter === 'active');
  context.matchesMasterSearch = o => [o.name,o.code,o.sido].some(v => (v || '').includes(context.masterAgencySearchTerm));
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function centralMasterTree(target)'), source.indexOf('\nfunction renderMasterAgencyList')),context);
  return context;
}
test('광역 필터에는 광역만 표시하며 펼치기와 하위 컨테이너를 제거한다', () => {
  const result = setup().centralMasterTree({});
  assert.equal(result.visible,2); assert.equal(result.total,2);
  assert.match(result.html,/서울광역/); assert.match(result.html,/부산광역/);
  assert.match(result.html,/data-master-agency-code="R1"/);
  assert.doesNotMatch(result.html,/data-master-region-toggle|master-region-children|하위기관|미지정기관/);
});
test('광역 검색은 기관명·코드·시도와 사용 상태를 적용한다', () => {
  for (const keyword of ['서울광역','R1','서울']) {
    assert.equal(setup({masterAgencySearchTerm:keyword}).centralMasterTree({}).visible,1);
  }
  const result = setup({masterStateFilter:'inactive'}).centralMasterTree({});
  assert.equal(result.visible,1); assert.match(result.html,/부산광역/);
  assert.equal(setup({masterAgencySearchTerm:'하위기관'}).centralMasterTree({}).visible,0);
});
test('전체 기관 트리와 수행기관 필터는 하위 기관을 유지한다', () => {
  const context = setup({masterLevelFilter:'all'});
  const all = context.centralMasterTree({});
  assert.match(all.html,/data-master-region-toggle/); assert.match(all.html,/data-child="A1"/);
  assert.match(all.html,/data-child="A2"/);
  context.masterLevelFilter='agency';
  assert.equal(context.centralMasterTree({}).visible,2);
  context.masterLevelFilter='regional';
  assert.doesNotMatch(context.centralMasterTree({}).html,/data-child/);
});
test('광역기관 표시 문자열을 HTML 이스케이프한다', () => {
  const context = setup(); context.institutionMaster[0].name='<img src=x>';
  assert.match(context.centralMasterTree({}).html,/&lt;img/);
});
