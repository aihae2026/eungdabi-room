const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('홈 상단 기관추가 DOM과 해당 요소 접근 코드를 제거한다',()=>{
  assert.doesNotMatch(read('index.html'),/v8HeaderAction/);
  assert.doesNotMatch(read('assets/v8-workspace.js'),/v8HeaderAction/);
  assert.match(read('index.html'),/id="addInstitutionButton"/);
});
test('관리자·제출·랜딩 화면의 정적 권한 명칭을 통일한다',()=>{
  for(const file of ['index.html','intake.html','landing.html','assets/intake.js','assets/landing/landing.js','assets/v8-workspace.js']) {
    assert.doesNotMatch(read(file),/중앙운영기관|중앙기관|광역지원기관|수행기관|직원/,file);
  }
  assert.match(read('index.html'),/value="regional">광역관리자/);
  assert.match(read('index.html'),/value="agency">기관담당자/);
  assert.match(read('intake.html'),/조사자용/);
});
test('기관 일괄등록 양식은 이전 제목과 새 제목을 모두 인식한다',()=>{
  const source=read('assets/app.js');
  const start=source.indexOf('  const headerValues = worksheet.getRow(1)');
  const end=source.indexOf('\n  columns.forEach',start);
  const context={worksheet:{getRow:()=>({values:[undefined,'광역지원기관명','소속 광역기관 코드','수행기관명','직원용 비밀번호','그룹관리자명','소속 그룹관리자 코드','운영담당자명','광역관리자명','기관담당자명']})}};
  vm.createContext(context);
  const result=vm.runInContext(source.slice(start,end)+'\nJSON.stringify(headerValues)',context);
  assert.deepEqual(JSON.parse(result),['광역관리자명','소속 광역관리자 코드','기관담당자명','조사자용 비밀번호','광역관리자명','소속 광역관리자 코드','기관담당자명','광역관리자명','기관담당자명']);
});

test('서버 안내와 이전 GAS 화면도 새 역할 명칭을 사용하고 기관명은 보존한다',()=>{
  for(const file of ['netlify/functions/api-legacy.cjs','gas/app.html','gas/index.html','gas/intake.html']) {
    const source=read(file).replaceAll('가상 수행기관','가상 기관');
    assert.doesNotMatch(source,/중앙운영기관|중앙기관|광역지원기관|수행기관|직원/,file);
  }
  assert.match(read('gas/app.html'),/가상 수행기관 001/);
  assert.match(read('assets/institutions.js'),/가상 수행기관 001/);
});

test('역할명 변경 후 조사 오류와 중복 담당자 문구가 남지 않는다',()=>{
  for(const file of ['index.html','assets/app.js','assets/v8-workspace.js','landing.html','netlify/functions/api-legacy.cjs']) {
    assert.doesNotMatch(read(file),/광역관리자은|기관담당자은|기관담당자을|지역 기관담당자|기관담당자 담당자|광역관리자과|기관담당자이 |조사자은/,file);
  }
});

test('중앙관리자·광역관리자·기관담당자·현장조사자로 바꾼 뒤 이전 명칭이 화면과 서버 안내에 남지 않는다',()=>{
  const previous=/통합관리자|그룹관리자|그룹 필터|전체 그룹|그룹 미지정|그룹별|운영담당자|운영 담당자|기관 담당자|현장 조사자|기관담당자 기관/;
  for(const file of ['index.html','intake.html','landing.html','assets/intake.js','assets/landing/landing.js','assets/v8-workspace.js','assets/template-targets.js','netlify/functions/api-legacy.cjs']) {
    assert.doesNotMatch(read(file),previous,file);
  }
  // 엑셀 일괄등록은 이전에 받은 양식의 제목을 새 명칭으로 바꿔 읽으므로, 그 변환 부분만 빼고 검사한다.
  assert.doesNotMatch(read('assets/app.js').replace(/\.replaceAll\('[^']+', '[^']+'\)/g,''),previous,'assets/app.js');
});
