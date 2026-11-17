const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../assets/ai-connection.js');
const valid={topic:'합성 방문 만족도',targetAudience:'합성 참여자',questionCount:7,requirements:''};
test('invalid counts and missing target do not send requests',async()=>{
 let called=0;const request=async()=>{called++;throw new Error('unexpected request');};
 for(const questionCount of [0,2,101,3.5,NaN])await assert.rejects(api.generateText(request,{...valid,questionCount}));
 await assert.rejects(api.generateText(request,{...valid,targetAudience:''}));assert.equal(called,0);
});
test('unconfigured status blocks generation',async()=>{
 const calls=[];await assert.rejects(api.generateText(async(path)=>{calls.push(path);return {configured:false};},valid),/설정/);
 assert.deepEqual(calls,['/checklist-templates/ai-status']);
});
test('status then existing generation contract, no credential or provider in browser request',async()=>{
 const calls=[];const result=await api.generateText(async(path,options)=>{calls.push({path,options});return path.endsWith('ai-status')?{configured:true,model:'fixture-model'}:{draft:{status:'draft',questions:Array.from({length:7},()=>({questionText:'합성 문항'}))},model:'fixture-model'};},valid);
 assert.equal(calls[1].path,'/checklist-templates/ai-draft');assert.deepEqual(calls[1].options,{method:'POST',body:valid});assert.equal(result.draft.questions.length,7);
});
test('generation failure is not retried or replaced with fake success',async()=>{
 let n=0;await assert.rejects(api.generateText(async()=>{if(++n===1)return {configured:true};throw new Error('일시적 연결 오류');},valid),/연결 오류/);assert.equal(n,2);
});
test('malformed provider result is not accepted as a draft',async()=>{
 for(const draft of [null,{status:'active',questions:[{}]},{status:'draft',questions:[]}]){
 let n=0;await assert.rejects(api.generateText(async()=>++n===1?{configured:true}:{draft},valid),/응답 형식/);
 }
});
