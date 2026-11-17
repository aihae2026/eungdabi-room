'use strict';
// Used only by dev-mock-server --admin-ux. In-memory synthetic data; no provider calls.
function createPreviewApi(seedTemplates = []) {
  const accounts = new Map(), forms = new Map();
  const services = [{id:'openai',name:'OpenAI · 로컬 합성 연결',models:['mock-text-model'],files:true}];
  return function preview(route, method, body, code) {
    if (!accounts.has(code)) accounts.set(code,{enabled:true,provider:'openai',model:'mock-text-model',connections:{openai:{verified:true,handle:'mock-connection',maskedKey:'합성 연결'}},revision:1});
    const state = accounts.get(code);
    if(route==='/ai/settings') {
      if(method==='PATCH') {
        if(body.revision!==state.revision) return {status:409,body:{message:'다른 창에서 설정이 변경됐습니다. 새로고침해 주세요.'}};
        accounts.set(code,{...body,revision:state.revision+1});
        return {body:accounts.get(code)};
      }
      return {body:{state,services,canManage:true}};
    }
    if(route==='/ai/settings/verify') return {body:{verified:true,handle:'mock-connection',maskedKey:'합성 연결',models:['mock-text-model']}};
    if(route==='/checklist-templates/ai-status') return {body:{configured:state.enabled,files:state.enabled,provider:'mock',model:state.model,questionCount:{min:3,max:100}}};
    if(!forms.has(code)) forms.set(code,[{id:'preview-draft',title:'로컬 확인용 설문 양식',status:'draft',description:'저장 후 운영 시작 흐름을 확인하는 합성 양식입니다.',generationMethod:'manual',scoringEnabled:false,questions:[1,2,3].map(n=>({questionNo:n,questionText:`확인용 질문 ${n}`,answerType:'text',required:false,options:[]}))}]);
    const templates=forms.get(code);
    for(const seed of seedTemplates)if(!templates.some(t=>t.id===seed.id))templates.push(structuredClone(seed));
    if(route==='/checklist-templates') {
      if(method==='POST') {const template={...body,id:`preview-${templates.length+1}`,status:'draft'};templates.push(template);return {body:{template}};}
      return {body:{templates}};
    }
    const match=route.match(/^\/checklist-templates\/([^/]+)(?:\/(activate|close|copy))?$/);
    if(match) {
      const template=templates.find(t=>t.id===match[1]);
      if(!template)return {status:404,body:{message:'합성 양식을 찾을 수 없습니다.'}};
      if(method==='PATCH')Object.assign(template,body);
      if(method==='DELETE')templates.splice(templates.indexOf(template),1);
      if(match[2]==='activate')template.status='active';
      if(match[2]==='close')template.status='closed';
      if(match[2]==='copy'){const copy={...template,id:`preview-${templates.length+1}`,title:body.title,status:'draft'};templates.push(copy);return {body:{template:copy}};}
      return {body:{template}};
    }
    return null;
  };
}
module.exports={createPreviewApi};
