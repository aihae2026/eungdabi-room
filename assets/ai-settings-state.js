/* Settings metadata only. Credentials are never retained in controller state. */
(function(root){
 const clone=v=>JSON.parse(JSON.stringify(v));
 class SettingsState {
  constructor(adapter){this.adapter=adapter;this.saved={enabled:false,provider:'',model:'',connections:{},revision:0};this.draft=clone(this.saved);this.services=[];this.canManage=false;this.busy=false;this.sequence=0;}
  async load(){const id=++this.sequence;const value=await this.adapter.read();if(id!==this.sequence)return null;this.saved=clone(value.state);this.draft=clone(this.saved);this.services=clone(value.services);this.savedServices=clone(this.services);this.canManage=value.canManage===true;return value;}
  open(activate=false){this.draft=clone(this.saved);this.services=clone(this.savedServices||this.services);if(activate)this.draft.enabled=true;}
  get dirty(){return JSON.stringify(this.draft)!==JSON.stringify(this.saved);}
  choose(provider){if(this.busy)throw Error('처리 중입니다.');this.sequence++;this.draft.provider=provider;this.draft.model='';}
  get ready(){const c=this.draft.connections[this.draft.provider];return Boolean(c?.verified&&c?.handle&&this.draft.model&&this.services.find(s=>s.id===this.draft.provider)?.models.includes(this.draft.model));}
  cancel(){this.sequence++;this.busy=false;this.draft=clone(this.saved);this.services=clone(this.savedServices||this.services);}
  async verify(input){
   if(!this.canManage)throw Error('연결 관리 API가 아직 연결되지 않았습니다.');
   if(this.busy)throw Error('처리 중입니다.');
   if(!this.draft.provider)throw Error('AI 서비스를 선택해 주세요.');
   const provider=this.draft.provider,id=++this.sequence;this.busy=true;
   try {const connection=await this.adapter.verify({provider,input});
    if(id!==this.sequence)return false;
    if(!connection?.verified||typeof connection.handle!=='string'||!connection.handle)throw Error('연결 확인 결과를 확인할 수 없습니다.');
    this.draft.connections[provider]={verified:true,handle:connection.handle,maskedKey:connection.maskedKey||''};
    if(Array.isArray(connection.models)){const service=this.services.find(s=>s.id===provider);if(service)service.models=connection.models;}
    return true;
   } finally {if(id===this.sequence)this.busy=false;}
  }
  remove(){if(this.busy)throw Error('처리 중입니다.');this.sequence++;delete this.draft.connections[this.draft.provider];this.draft.model='';this.draft.enabled=false;}
  async save(){
   if(!this.canManage)throw Error('설정 저장 API가 아직 연결되지 않았습니다.');
   if(this.busy)throw Error('처리 중입니다.');
   if(this.draft.enabled&&!this.ready)throw Error('연결 확인과 모델 선택을 완료해 주세요.');
   this.busy=true;
   try {
    const state=await this.adapter.save(clone(this.draft));
    if(!state||!Number.isInteger(state.revision)||state.revision<=this.saved.revision)throw Error('저장 결과를 확인할 수 없습니다.');
    this.saved=clone(state);this.draft=clone(state);this.savedServices=clone(this.services);return state;
   } finally {this.busy=false;}
  }
 }
 if(typeof module==='object'&&module.exports)module.exports=SettingsState;else root.AISettingsState=SettingsState;
})(globalThis);

