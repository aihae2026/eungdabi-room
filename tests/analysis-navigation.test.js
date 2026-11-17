const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/v8-workspace.js'), 'utf8');
function setup(step) {
  const buttons = [1,2,3,4].map(n => ({dataset:{astep:String(n)},classList:{toggle(){}},setAttribute(){}}));
  const context = {anStep:step,anResult:{tables:[]},anLoading:false,anError:'',
    document:{querySelectorAll:s => s === '.v8-astep' ? buttons : []},
    anRenderStep1(){},anRenderStep2(){},anRenderStep3(){},anRenderStep4(){},showToast(){},window:{scrollTo(){}}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function anRender()'), source.indexOf('  async function anStart()')),context);
  return {context,buttons};
}
test('모든 단계에서 상단 현재·다음 탭은 비활성이고 이전 탭만 활성이다',()=>{
  for(let step=1;step<=4;step++) {
    const {context,buttons}=setup(step);context.anRender();
    assert.deepEqual(buttons.map(b=>b.disabled),[1,2,3,4].map(n=>n>=step));
  }
});
test('상단 다음 단계 이동은 결과 존재 여부와 무관하게 차단한다',()=>{
  for(let step=1;step<4;step++) for(let target=step+1;target<=4;target++) {
    const {context}=setup(step);context.anGoto(target);assert.equal(context.anStep,step);
  }
});
test('이전 단계 복귀 후에도 상단 앞으로 이동은 차단한다',()=>{
  const {context}=setup(4);context.anGoto(2);assert.equal(context.anStep,2);
  context.anGoto(3);assert.equal(context.anStep,2);
});
test('결과 분석 다음 버튼은 성공한 STEP 3에서만 STEP 4로 이동한다',()=>{
  const {context}=setup(3);context.anGoto(4,true);assert.equal(context.anStep,4);
  for(const values of [{anStep:2},{anLoading:true},{anError:'실패'},{anResult:null}]) {
    const {context:c}=setup(3);Object.assign(c,values);const before=c.anStep;c.anGoto(4,true);assert.equal(c.anStep,before);
  }
});
