const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('entry redirects are exact and leave API/intake routes untouched', () => {
  const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  const routes = toml.split('[[redirects]]').slice(1).map(block => {
    block = block.split(/\n\[/)[0];
    return Object.fromEntries([...block.matchAll(/^\s*(from|to|status|force)\s*=\s*(?:"([^"]*)"|(\d+|true|false))/gm)].map(m=>[m[1],m[2] ?? m[3]]));
  });
  const blocked = routes.filter(r => r.status === '404');
  assert.deepEqual(blocked.map(r=>r.from), ['/supabase/*','/netlify/*','/scripts/*','/tests/*','/docs/*','/gas/*','/outputs/*','/package.json','/package-lock.json','/README.md','/DESIGN.md','/SUBMISSION_README.md','/SUBMISSION_MANIFEST.json','/THIRD_PARTY_NOTICES.md']);
  for (const rule of blocked) assert.deepEqual(rule,{from:rule.from,to:'/404.html',status:'404',force:'true'});
  assert.deepEqual(routes.filter(r=>r.status !== '404'), [
    {from:'/',to:'/landing#welcome',status:'302',force:'true'},
    {from:'/index.html',to:'/admin',status:'302',force:'true'},
    {from:'/admin',to:'/index.html',status:'200',force:'true'},
    {from:'/landing',to:'/landing.html',status:'200',force:'true'},
  ]);
});
test('landing login and fallback use the stable admin route', () => {
  const html = fs.readFileSync(path.join(root,'landing.html'),'utf8');
  const js = fs.readFileSync(path.join(root,'assets/landing/login-modal.js'),'utf8');
  assert.equal((html.match(/href="\/admin"/g)||[]).length,2);
  assert.match(js,/window\.location\.assign\('\/admin#home'\)/);
});
