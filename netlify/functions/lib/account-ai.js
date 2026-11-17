'use strict';
const crypto = require('node:crypto');
const SERVICES = [
  { id: 'openai', name: 'OpenAI', models: [], files: true },
  { id: 'anthropic', name: 'Anthropic Claude', models: [], files: false },
  { id: 'google', name: 'Google Gemini', models: [], files: false },
];
function error(statusCode, message) { return Object.assign(new Error(message), { statusCode, publicMessage: message }); }
function env(name) { return globalThis.Netlify?.env?.get(name) || process.env[name]; }
function encryptionKey() {
  const value = env('AI_SETTINGS_ENCRYPTION_KEY') || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw error(503, 'AI 키 암호화 설정이 필요합니다. 운영관리자에게 문의해 주세요.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw error(503, 'AI 키 암호화 설정을 확인해 주세요.');
  return key;
}
function seal(owner, purpose, value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${owner}:${purpose}:v1`));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function unseal(owner, purpose, value) {
  const key = encryptionKey();
  try {
    if (typeof value !== 'string' || value.length > 50000) throw Error();
    const [version, iv, tag, data, extra] = value.split('.');
    if (version !== 'v1' || extra) throw Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`${owner}:${purpose}:v1`)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString());
  } catch { throw error(400, '연결 확인이 만료되었거나 유효하지 않습니다. 다시 연결해 주세요.'); }
}
function service(provider) {
  const item = SERVICES.find(s => s.id === provider);
  if (!item) throw error(400, '지원하지 않는 AI 서비스입니다.');
  return item;
}
function supported(provider, id) {
  if (typeof id !== 'string' || id.length > 150) return false;
  if (provider === 'openai') return /^gpt-(?:4o|4\.1|5)(?:-|\.|$)/.test(id) && !/audio|realtime|image|search|codex|research|transcribe|tts|pro/.test(id);
  if (provider === 'anthropic') return /^claude-(?:sonnet|haiku|opus)-/.test(id);
  return /^gemini-/.test(id) && !/image|audio|live|tts|embedding|robotics/.test(id);
}
async function request(url, headers, body, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000), redirect: 'error' });
    if (!res.ok) {
      const status = [401,403,429].includes(res.status) ? res.status : 502;
      throw error(status, status === 429 ? 'AI 사용 한도 또는 요청 제한에 도달했습니다. 요금·한도를 확인해 주세요.' : status === 401 || status === 403 ? 'API 키 또는 해당 모델의 사용 권한을 확인해 주세요.' : 'AI 요청을 처리하지 못했습니다. 선택한 모델의 지원 여부를 확인하고 다시 시도해 주세요.');
    }
    return await res.json();
  } catch (e) {
    if (e.publicMessage) throw e;
    throw error(502, 'AI 연결 응답이 없거나 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
  }
}
async function listModels(provider, key, fetchImpl) {
  service(provider);
  let ids;
  if (provider === 'openai') ids = (await request('https://api.openai.com/v1/models', {Authorization:`Bearer ${key}`}, null, fetchImpl)).data?.map(m=>m.id);
  else if (provider === 'anthropic') ids = (await request('https://api.anthropic.com/v1/models?limit=100', {'x-api-key':key,'anthropic-version':'2023-06-01'}, null, fetchImpl)).data?.map(m=>m.id);
  else ids = (await request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {'x-goog-api-key':key}, null, fetchImpl)).models?.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
  const models = [...new Set((ids || []).filter(id=>supported(provider,id)))].sort().slice(0,100);
  if (!models.length) throw error(400, '이 키에서 시스템이 지원하는 텍스트 모델을 찾지 못했습니다.');
  return models;
}
// One normalized Responses-style contract is used by generation and analysis.
async function complete(credential, body, fetchImpl = fetch) {
  service(credential.provider);
  if (!credential.apiKey || !supported(credential.provider,credential.model)) throw error(412,'AI 연결 설정을 확인해 주세요.');
  const content = (body.input || []).flatMap(m=>m.content || []);
  const files = content.some(c=>c.type !== 'input_text');
  if (files && !service(credential.provider).files) throw error(400,'선택한 AI 연결은 파일 입력을 지원하지 않습니다. 텍스트 설문 생성 또는 참고파일 없는 분석을 사용해 주세요.');
  const limit = body.max_output_tokens || 12000;
  if (credential.provider === 'openai') {
    return request('https://api.openai.com/v1/responses', {Authorization:`Bearer ${credential.apiKey}`}, {...body, model:credential.model, max_output_tokens:limit, store:false}, fetchImpl);
  }
  const prompt = content.map(c=>c.text || '').join('\n');
  const instructions = (body.instructions || '') + '\nReturn only the requested valid JSON object. Do not use Markdown fences.';
  if (credential.provider === 'anthropic') {
    const data = await request('https://api.anthropic.com/v1/messages', {'x-api-key':credential.apiKey,'anthropic-version':'2023-06-01'}, {model:credential.model,max_tokens:limit,system:instructions,messages:[{role:'user',content:prompt}]}, fetchImpl);
    return {output_text:(data.content || []).filter(p=>p.type==='text').map(p=>p.text).join(''),usage:data.usage};
  }
  const data = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(credential.model)}:generateContent`, {'x-goog-api-key':credential.apiKey}, {systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:limit}}, fetchImpl);
  return {output_text:(data.candidates?.[0]?.content?.parts || []).filter(p=>!p.thought).map(p=>p.text || '').join(''),usage:{input_tokens:data.usageMetadata?.promptTokenCount,output_tokens:data.usageMetadata?.candidatesTokenCount}};
}
function outputText(data) { return data?.output_text || (data?.output || []).flatMap(i=>i.content || []).filter(p=>p.type==='output_text').map(p=>p.text).join(''); }
function createAccountAI({db, fetchImpl = fetch, now = Date.now}) {
  const rpc = async (name, body) => {
    try { return await db(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)}); }
    catch (e) { if (e.message?.includes('AI_REVISION_CONFLICT')) throw error(409,'다른 창에서 설정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.'); throw error(503,'AI 설정 저장소를 사용할 수 없습니다. 운영관리자에게 문의해 주세요.'); }
  };
  async function owner(token) {
    if (token?.scope !== 'admin' || !['central','regional','agency'].includes(token.role) || !token.agencyCode) throw error(403,'로그인한 관리자 계정만 AI를 설정할 수 있습니다.');
    const code = encodeURIComponent(token.agencyCode);
    const accounts = await db(`agency_accounts?institution_code=eq.${code}&active=is.true&select=institution_code`);
    const institutions = await db(`institutions?code=eq.${code}&active=is.true&select=code`);
    if (!accounts[0] || !institutions[0]) throw error(403,'비활성 계정에서는 AI를 사용할 수 없습니다.');
    return token.agencyCode;
  }
  async function row(code) {
    try { return (await db(`account_ai_settings?account_code=eq.${encodeURIComponent(code)}&select=*`))[0] || null; }
    catch { throw error(503,'AI 설정 저장소를 사용할 수 없습니다. 운영관리자에게 문의해 주세요.'); }
  }
  function metadata(r) {
    const hasKey = Boolean(r?.key_ciphertext);
    return {enabled:Boolean(r?.enabled && hasKey),provider:r?.provider || '',model:r?.model || '',revision:Number(r?.revision || 0),configured:Boolean(r?.enabled && hasKey),connections:hasKey?{[r.provider]:{verified:true,handle:`saved:${r.revision}`,maskedKey:r.masked_key}}:{}};
  }
  async function read(token) {
    const code = await owner(token), r = await row(code);
    encryptionKey();
    return {canManage:true,state:metadata(r),services:SERVICES.map(s=>({...s,models:r?.provider===s.id?r.models || []:[]}))};
  }
  async function rate(code) {
    const allowed = await rpc('account_ai_take_attempt',{p_account_code:code});
    if (allowed !== true) throw error(429,'AI 연결 확인은 1분에 5회까지 가능합니다. 잠시 후 다시 시도해 주세요.');
  }
  async function verify(token, body) {
    const code = await owner(token); encryptionKey(); service(body.provider);
    const key = typeof body.input === 'string' ? body.input.trim() : '';
    if (key.length < 10 || key.length > 1024 || /\s/.test(key)) throw error(400,'API 키를 올바르게 입력해 주세요.');
    await rate(code);
    const r = await row(code), revision = Number(r?.revision || 0);
    const models = await listModels(body.provider,key,fetchImpl);
    const handle = seal(code,'verification',{provider:body.provider,key,models,revision,expires:now()+10*60*1000});
    return {verified:true,handle,models,maskedKey:`••••${key.slice(-4)}`};
  }
  async function save(token, body) {
    const code = await owner(token), r = await row(code), revision = Number(r?.revision || 0);
    if (!Number.isSafeInteger(body.revision) || body.revision !== revision) throw error(409,'다른 창에서 설정이 변경되었습니다. 새로고침해 주세요.');
    if (typeof body.enabled !== 'boolean') throw error(400,'AI 사용 여부를 확인해 주세요.');
    let provider = body.provider || '', model = body.model || '', key = '', models = [], ciphertext = null, maskedKey = '';
    const connection = body.connections?.[provider];
    if (connection?.handle) {
      service(provider); encryptionKey();
      if (connection.handle === `saved:${revision}` && r?.provider === provider && r.key_ciphertext) {
        key = unseal(code,'stored',r.key_ciphertext).key; models = r.models || []; ciphertext=r.key_ciphertext; maskedKey=r.masked_key;
      } else {
        const proof = unseal(code,'verification',connection.handle);
        if (proof.provider !== provider || proof.revision !== revision || proof.expires < now()) throw error(400,'연결 확인이 만료되었습니다. 다시 확인해 주세요.');
        key=proof.key; models=proof.models; ciphertext=seal(code,'stored',{key}); maskedKey=`••••${key.slice(-4)}`;
      }
      if (!models.includes(model) || !supported(provider,model)) throw error(400,'연결된 키에서 확인된 모델을 선택해 주세요.');
      // Probe on new key/model or re-enabling; stop/delete never needs the provider.
      if (body.enabled && (!r?.enabled || r.model!==model || ciphertext!==r.key_ciphertext)) {
        await rate(code);
        const result = await complete({provider,model,apiKey:key},{instructions:'Return JSON only.',input:[{role:'user',content:[{type:'input_text',text:'Return {"ok":true}.'}]}],max_output_tokens:1024},fetchImpl);
        let json;try {json=JSON.parse(outputText(result).trim().replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{}
        if (json?.ok !== true) throw error(502,'모델의 JSON 응답 검증에 실패했습니다. 다른 지원 모델을 선택해 주세요.');
      }
    } else {
      if (body.enabled) throw error(400,'API 키 연결 확인과 모델 선택을 완료해 주세요.');
      provider='';model='';
    }
    const result = await rpc('account_ai_save',{p_account_code:code,p_expected_revision:revision,p_enabled:body.enabled,p_provider:provider,p_model:model,p_key_ciphertext:ciphertext,p_masked_key:maskedKey,p_models:models});
    return metadata(Array.isArray(result)?result[0]:result);
  }
  async function resolve(token) {
    const code=await owner(token),r=await row(code);
    if (!r?.enabled || !r.key_ciphertext) return null;
    return {provider:r.provider,model:r.model,apiKey:unseal(code,'stored',r.key_ciphertext).key,files:service(r.provider).files};
  }
  return {read,verify,save,resolve};
}
module.exports={createAccountAI,complete,outputText,seal,unseal,supported,listModels,SERVICES};
