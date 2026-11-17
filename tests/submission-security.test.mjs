import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(script, extra = {}) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, encoding: 'utf8', env: { ...process.env, SEED_OUTPUT_DIR: '', ...extra } });
}
function list(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir,e.name),base) : [path.relative(base,path.join(dir,e.name)).replaceAll('\\','/')]).sort();
}
test('build publishes exactly the allowlist and removes stale output', () => {
  assert.equal(run('build-public.mjs').status,0);
  fs.writeFileSync(path.join(root,'public','seed.sql'),'synthetic sentinel only');
  assert.equal(run('build-public.mjs').status,0);
  const expected = JSON.parse(fs.readFileSync(path.join(root,'scripts/public-files.json'),'utf8')).sort();
  assert.deepEqual(list(path.join(root,'public')),expected);
  for(const file of expected) assert.deepEqual(fs.readFileSync(path.join(root,file)),fs.readFileSync(path.join(root,'public',file)));
  for(const file of ['supabase/seed.sql','supabase/schema.sql','netlify/functions/api-legacy.cjs','scripts/generate-supabase-seed.mjs','package.json','README.md']) assert.equal(fs.existsSync(path.join(root,'public',file)),false);
  assert.ok(expected.includes('user-guide.html'));
  assert.ok(expected.includes('assets/legal/THIRD_PARTY_NOTICES.md'));
  assert.ok(expected.includes('assets/vendor/exceljs.LICENSE.txt'));
});
test('Netlify config separates static files from API functions and defines forced 404 rules',()=>{
  const config=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
  assert.match(config,/publish = "public"/);
  assert.match(config,/command = "npm run build"/);
  assert.match(config,/functions = "netlify\/functions"/);
  for(const p of ['/supabase/*','/netlify/*','/scripts/*','/tests/*','/docs/*','/gas/*','/package.json','/README.md']) {
    const block=config.split('[[redirects]]').find(b=>b.includes(`from = "${p}"`));
    assert.ok(block,p); assert.match(block,/status = 404/); assert.match(block,/force = true/);
  }
  assert.match(fs.readFileSync(path.join(root,'netlify/functions/api.mjs'),'utf8'),/path: "\/api\/\*"/);
});
test('seed refuses missing, relative and project-local output directories',()=>{
  for(const output of ['', 'relative-seed',path.join(root,'seed-output'),path.join(root,'public','seed-output')]) assert.notEqual(run('generate-supabase-seed.mjs',{SEED_OUTPUT_DIR:output}).status,0);
});
test('seed uses private external files, distinct passwords, matching hashes and no secret console output',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'submission-seed-test-'));
  try {
    const output=path.join(temp,'private');
    const result=run('generate-supabase-seed.mjs',{SEED_OUTPUT_DIR:output});
    assert.equal(result.status,0,result.stderr);
    const rows=JSON.parse(fs.readFileSync(path.join(output,'seed-credentials.json'),'utf8'));
    const sql=fs.readFileSync(path.join(output,'seed.sql'),'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/institutions.js'), 'utf8'), sandbox);
    const institutions = sandbox.window.INSTITUTION_MASTER;
    const quote = value => `'${String(value).replaceAll("'", "''")}'`;
    const seen = new Map([['SAMPLECENTRAL', 'central']]);
    assert.equal(rows.length, institutions.length + 1);
    assert.equal(rows[0].institutionCode, 'SAMPLECENTRAL');
    for (const item of institutions) {
      const sigungu = item.type === 'regional' ? '' : item.sigungu;
      assert.ok(sql.includes(`(${quote(item.code)}, ${quote(item.name)}, ${quote(item.sido)}, ${quote(sigungu)}, ${quote(item.type)}, ${quote(item.parentCode)},`));
      assert.match(item.code, /^[A-Z0-9]+$/);
      assert.equal(seen.get(item.parentCode), item.type === 'regional' ? 'central' : 'regional');
      assert.ok(!seen.has(item.code));
      seen.set(item.code, item.type);
    }
    const passwords=rows.flatMap(r=>[r.adminPassword,r.intakePassword]);
    assert.equal(new Set(passwords).size,rows.length*2);
    const records=[...sql.matchAll(/'([a-f0-9]{64})', '([a-f0-9]{32})', '([a-f0-9]{64})', '([a-f0-9]{32})'/g)];
    assert.equal(records.length,rows.length);
    rows.forEach((r,i)=>{
      assert.equal(crypto.pbkdf2Sync(r.adminPassword,records[i][2],100000,32,'sha256').toString('hex'),records[i][1]);
      assert.equal(crypto.pbkdf2Sync(r.intakePassword,records[i][4],100000,32,'sha256').toString('hex'),records[i][3]);
    });
    for(const password of passwords) { assert.ok(!sql.includes(password)); assert.ok(!result.stdout.includes(password)); assert.ok(!result.stderr.includes(password)); }
    assert.ok(!sql.includes('coalesce(intake_password_hash, password_hash)'));
    const before=fs.readFileSync(path.join(output,'seed.sql'));
    assert.notEqual(run('generate-supabase-seed.mjs',{SEED_OUTPUT_DIR:output}).status,0);
    assert.deepEqual(fs.readFileSync(path.join(output,'seed.sql')),before);
  } finally {
    // Only the exact directory created by mkdtemp above is removed.
    assert.ok(path.basename(temp).startsWith('submission-seed-test-'));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('fresh schema declares private tables, sequences and explicit server privileges', () => {
  const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8').toLowerCase();
  const tables = ['institutions', 'agency_accounts', 'submissions', 'submission_answers',
    'audit_logs', 'checklist_templates', 'template_questions', 'question_options', 'ai_generation_logs'];
  for (const name of tables) {
    assert.ok(schema.includes(`alter table public.${name} enable row level security;`), name);
    assert.ok(schema.includes(`revoke all on table public.${name} from public, anon, authenticated;`), name);
    assert.ok(schema.includes(`grant select, insert, update, delete on table public.${name} to service_role;`), name);
  }
  for (const name of ['submission_answers', 'audit_logs', 'template_questions', 'question_options', 'ai_generation_logs']) {
    assert.ok(schema.includes(`revoke all on sequence public.${name}_id_seq from public, anon, authenticated;`));
    assert.ok(schema.includes(`grant usage, select on sequence public.${name}_id_seq to service_role;`));
  }
  const ai = fs.readFileSync(path.join(root, 'supabase/account-ai.sql'), 'utf8');
  assert.match(ai, /revoke all on public.account_ai_settings, public.account_ai_attempts from public,anon,authenticated;/);
  assert.match(ai, /grant select,insert,update,delete on public.account_ai_settings, public.account_ai_attempts to service_role;/);
});
