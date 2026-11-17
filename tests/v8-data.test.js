const test = require('node:test');
const assert = require('node:assert/strict');
const {scopeStats} = require('../assets/v8-data.js');
const institutions = [{code:'A1',name:'합성 기관 1',sido:'시도 A',sigungu:'지역 1'},{code:'A2',name:'합성 기관 2',sido:'시도 A',sigungu:'지역 2'},{code:'B1',name:'합성 기관 3',sido:'시도 B',sigungu:'지역 3'}];
test('기관 분모에 미제출 기관을 포함하고 다른 권한 범위의 통계는 제외한다',()=>{
 const rows=scopeStats([{institution_code:'A1',total:8,unique_clients:4},{institution_code:'OUTSIDE',total:900}],institutions,{});
 assert.equal(rows.length,3);assert.equal(rows.reduce((n,r)=>n+r.total,0),8);assert.equal(rows[1].total,0);
});
test('기관 및 지역 조건은 같은 기관 분모와 결과에 적용한다',()=>{
 assert.deepEqual(scopeStats([],institutions,{sido:'시도 A'}).map(r=>r.institution_code),['A1','A2']);
 assert.deepEqual(scopeStats([],institutions,{agencyCode:'A2'}).map(r=>r.institution_code),['A2']);
 assert.deepEqual(scopeStats([],institutions,{sido:'시도 B',agencyCode:'A2'}),[]);
});
test('수행기관 범위는 같은 지역의 다른 기관으로 확장되지 않는다',()=>{
 const rows=scopeStats([{institution_code:'A1',total:8},{institution_code:'A2',total:4}],institutions.slice(0,1),{});
 assert.deepEqual(rows.map(r=>r.institution_code),['A1']);
});
test('CSV는 쉼표와 줄바꿈을 보존하고 스프레드시트 수식을 텍스트로 내보낸다',()=>{
 const {csvCell}=require('../assets/v8-data.js');
 assert.equal(csvCell('기관, A'), '"기관, A"');
 assert.equal(csvCell('첫줄\n다음줄'), '"첫줄\n다음줄"');
 assert.equal(csvCell('="수식"'), '"\'=\"\"수식\"\""');
});
