(function () {
  'use strict';
  const dialog = document.querySelector('#loginDialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const form = document.querySelector('#landingLoginForm');
  const loginId = document.querySelector('#landingLoginId');
  const password = document.querySelector('#landingLoginPassword');
  const error = document.querySelector('#landingLoginError');
  const submit = form.querySelector('[type="submit"]');
  let opener = null, request = null;
  function busy(value) {
    submit.disabled = value;
    submit.textContent = value ? '로그인 중…' : '로그인';
    form.setAttribute('aria-busy', String(value));
  }
  document.querySelectorAll('[data-login-modal]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      document.dispatchEvent(new Event('landing:login-open'));
      error.textContent = '';
      dialog.showModal();
      loginId.focus();
    });
  });
  dialog.querySelector('.login-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    request?.abort();
    request = null;
    password.value = '';
    error.textContent = '';
    busy(false);
    const mobileMenu = document.querySelector('.menu-toggle');
    if (opener?.closest('#siteNav') && matchMedia('(max-width: 800px)').matches && mobileMenu) mobileMenu.focus();
    else opener?.focus({preventScroll:true});
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (request) return;
    const controller = new AbortController();
    request = controller;
    busy(true);
    error.textContent = '';
    try {
      const response = await fetch('/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({agencyCode:loginId.value.trim().toUpperCase(), password:password.value}),
        signal:controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || '로그인 정보를 확인해 주세요.');
      if (typeof payload.token !== 'string' || !payload.token || !payload.agency?.code) throw new Error('로그인 응답을 확인할 수 없습니다. 다시 시도해 주세요.');
      if (controller.signal.aborted || !dialog.open) return;
      // Same session contract consumed by index.html's initializeAuth().
      const values = {
        lifeSafetyAdminAgencyCode:payload.agency.code,
        lifeSafetyAdminToken:payload.token,
        lifeSafetyAdminAgency:JSON.stringify(payload.agency),
        lifeSafetyAdminAuthenticated:'Y',
      };
      const prior = Object.fromEntries(Object.keys(values).map(key => [key, sessionStorage.getItem(key)]));
      try {
        Object.entries(values).forEach(([key,value]) => sessionStorage.setItem(key,value));
      } catch (storageError) {
        Object.entries(prior).forEach(([key,value]) => {try {value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key,value);} catch {}});
        throw new Error('로그인 정보를 저장할 수 없습니다. 브라우저의 저장소 설정을 확인해 주세요.');
      }
      password.value = '';
      window.location.assign('/admin#home');
    } catch (err) {
      if (request === controller && !controller.signal.aborted) error.textContent = err instanceof TypeError || err instanceof SyntaxError ? '연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.' : err.message;
    } finally {
      if (request === controller) { request = null; busy(false); }
    }
  });
})();
