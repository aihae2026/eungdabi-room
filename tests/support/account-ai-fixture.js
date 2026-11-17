const {seal}=require('../../netlify/functions/lib/account-ai');
function settingsRow(code='CENTRAL_TEST') {
  process.env.AI_SETTINGS_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
  return {account_code:code,provider:'openai',model:'gpt-5.4-mini',enabled:true,revision:1,models:['gpt-5.4-mini'],masked_key:'••••test',key_ciphertext:seal(code,'stored',{key:'account-key-test'})};
}
function accountResponse(url, row=null) {
  const path = new URL(String(url)).pathname;
  if(!String(url).includes('/rest/v1/'))return null;
  let value;
  if(path.endsWith('/agency_accounts')||path.endsWith('/institutions'))value=[{institution_code:'ACTIVE',code:'ACTIVE'}];
  else if(path.endsWith('/account_ai_settings'))value=row?[row]:[];
  else return null;
  return {ok:true,status:200,text:async()=>JSON.stringify(value),json:async()=>value};
}
module.exports={settingsRow,accountResponse};
