const test=require('node:test'),assert=require('node:assert/strict');
const State=require('../assets/ai-settings-state.js');
function fixture(){
 let saved={enabled:false,provider:'',model:'',connections:{},revision:0},fail=false;
 const adapter={read:async()=>({state:structuredClone(saved),services:[{id:'one',models:['m1']},{id:'two',models:['m2']}],canManage:true}),verify:async()=>({verified:true,handle:'metadata-only'}),save:async d=>{if(fail)throw Error('save failed');return saved={...d,revision:d.revision+1};}};
 return {adapter,state:new State(adapter),fail(){fail=true;}};
}
async function ready(f){await f.state.load();f.state.open(true);f.state.choose('one');await f.state.verify('synthetic-input');f.state.draft.model='m1';}
test('unverified or mismatched model cannot enable AI',async()=>{const f=fixture();await f.state.load();f.state.open(true);f.state.choose('one');f.state.draft.model='m1';await assert.rejects(f.state.save(),/연결/);await f.state.verify('synthetic-input');f.state.draft.model='m2';await assert.rejects(f.state.save(),/모델/);});
test('save failure preserves applied state and editable draft',async()=>{const f=fixture();await ready(f);f.fail();await assert.rejects(f.state.save());assert.equal(f.state.saved.enabled,false);assert.equal(f.state.draft.enabled,true);assert.equal(f.state.dirty,true);assert.equal(f.state.busy,false);});
test('cancel restores saved settings without retaining input',async()=>{const f=fixture();await ready(f);assert(!JSON.stringify(f.state).includes('synthetic-input'));f.state.cancel();assert.equal(f.state.dirty,false);assert.equal(f.state.saved.enabled,false);});
test('late verification cannot overwrite a cancelled editor',async()=>{const f=fixture();await f.state.load();f.state.open(true);f.state.choose('one');let finish;f.adapter.verify=()=>new Promise(r=>finish=r);const pending=f.state.verify('synthetic-input');f.state.cancel();finish({verified:true,handle:'stale'});assert.equal(await pending,false);assert.deepEqual(f.state.draft.connections,{});});
test('removing active connection disables AI only after saving',async()=>{const f=fixture();await ready(f);await f.state.save();f.state.open();f.state.remove();assert.equal(f.state.saved.enabled,true);assert.equal(f.state.draft.enabled,false);await f.state.save();assert.equal(f.state.saved.enabled,false);});
test('read-only adapter blocks writes and verification',async()=>{const f=fixture();f.adapter.read=async()=>({state:f.state.saved,services:[],canManage:false});await f.state.load();await assert.rejects(f.state.verify('synthetic-input'),/API/);await assert.rejects(f.state.save(),/API/);});
test('malformed verification is not accepted',async()=>{const f=fixture();await f.state.load();f.state.choose('one');f.adapter.verify=async()=>({verified:true});await assert.rejects(f.state.verify('synthetic-input'));assert.deepEqual(f.state.draft.connections,{});});

test('cancel key replacement restores the saved model catalog',async()=>{const f=fixture();await ready(f);await f.state.save();f.state.open();f.adapter.verify=async()=>({verified:true,handle:'replacement',models:['new-model']});await f.state.verify('replacement-key');assert.deepEqual(f.state.services[0].models,['new-model']);f.state.cancel();assert.deepEqual(f.state.services[0].models,['m1']);assert.equal(f.state.ready,true);});
test('saving prevents duplicate submissions',async()=>{const f=fixture();await ready(f);let finish;f.adapter.save=d=>new Promise(r=>finish=()=>r({...d,revision:d.revision+1}));const pending=f.state.save();await assert.rejects(f.state.save(),/처리 중/);finish();await pending;assert.equal(f.state.saved.revision,1);});

