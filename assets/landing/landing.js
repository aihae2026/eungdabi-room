(function () {
  'use strict';
  if (!window.ScrollGestureGate || !window.HTMLDialogElement) return;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const scenes = $$('.scene');
  const steps = { welcome: 1, about: 0, structure: 3, ai: 1, field: 1, guides: 4, faq: 3, start: 0 };
  const gate = new window.ScrollGestureGate();
  const dialog = $('#fieldDialog');
  const menu = $('.menu-toggle');
  const header = $('.site-header');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let sceneIndex = 0, step = 0, touch = null, dialogOpener = null;
  let sceneMotion = null, pendingNavigation = null;
  const current = () => scenes[sceneIndex];
  const content = () => $('.scene-content', current());
  const scopes = ['기관과 현장이 연결되는 하나의 공간', '중앙관리자 · 광역관리자별 현황', '광역관리자 · 소속 기관담당자별 현황', '기관담당자 · 현장에서 제출한 개별 응답'];
  const captions = ['현장의 응답이 쌓이고, 지역을 거쳐 전체 현황으로 모입니다.', '각 지역의 결과가 모여, 전체 조사 현황이 됩니다.', '기관담당자의 응답이 모여, 해당 지역의 현황이 됩니다.', '현장조사자의 응답이 소속 기관담당자에 쌓입니다.'];

  function closeMenu(returnFocus = false) {
    header.classList.remove('menu-open');
    menu.setAttribute('aria-expanded', 'false');
    if (returnFocus) menu.focus();
  }
  function cueLabel() {
    const id = current().id;
    if (id !== 'start' && canScroll(content(), 1)) return '다음 단계로 이동';
    if (id === 'welcome') return step ? '계속 스크롤해 응다비:룸 알아보기' : '스크롤해 응다비룸을 만나보세요';
    if (id === 'about') return '계속 스크롤해 중앙부터 현장까지 살펴보기';
    if (id === 'structure') return ['스크롤하면 중앙관리자를 확대해요', '더 내리면 광역관리자를 살펴봐요', '더 내리면 기관담당자를 살펴봐요.', '계속 스크롤해 서비스 기능 보기'][step];
    if (id === 'ai') return step ? '계속 스크롤해 현장 응답 보기' : '스크롤하면 초안 예시가 나타나요';
    if (id === 'field') return step ? '계속 스크롤해 이용 안내 보기' : '스크롤하면 응답 예시가 선택돼요';
    if (id === 'guides') return ['스크롤하면 중앙관리자 안내가 펼쳐져요', '더 내리면 광역관리자 안내로', '더 내리면 기관담당자 안내로', '더 내리면 현장조사자 안내로', '계속 스크롤해 이용 범위 확인하기'][step];
    if (id === 'faq') return step < 3 ? '스크롤하면 다음 질문의 답변이 펼쳐져요' : '계속 스크롤해 시작 안내 보기';
    return '처음으로 돌아가기';
  }
  function render(focusHeading = false) {
    const scene = current(), id = scene.id;
    scenes.forEach((el, index) => {
      const active = index === sceneIndex;
      el.classList.toggle('is-active', active);
      el.inert = !active;
    });
    scene.dataset.step = String(step);
    if (id === 'structure') {
      $('#roomScope').textContent = scopes[step];
      $('#roomCaption').textContent = captions[step];
      $$('[data-room-step]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.roomStep) === step)));
    }
    if (id === 'ai') {
      const button = $('#aiToggle');
      button.setAttribute('aria-expanded', String(Boolean(step)));
      button.firstChild.textContent = step ? '예시 다시 보기 ' : '초안 예시 보기 ';
      $('#aiDraft').inert = step === 0;
    }
    if (id === 'field') {
      const selected = $('input[name="example-mood"]:checked');
      if (step && !selected) $('input[value="neutral"]').checked = true;
      if (!step) $$('input[name="example-mood"]').forEach(radio => { radio.checked = false; });
      $('.example-status').textContent = step ? '예시 응답을 선택했어요.' : '응답을 골라보세요.';
    }
    if (id === 'guides') {
      $$('.guide-card').forEach(card => {
        const active = Number(card.dataset.guide) === step;
        card.classList.toggle('is-current', active);
        card.inert = !active;
      });
      $$('[data-guide-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.guideStep) === step)));
    }
    if (id === 'faq') $$('.faq-list details').forEach((detail, index) => { detail.open = index === step; });
    $$('#siteNav [data-group]').forEach(a => {
      if (a.dataset.group === scene.dataset.group) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    const position = scenes.slice(0, sceneIndex).reduce((sum, s) => sum + steps[s.id] + 1, 0) + step;
    const total = scenes.reduce((sum, s) => sum + steps[s.id] + 1, 0) - 1;
    $('.reading-progress span').style.transform = 'scaleX(' + position / total + ')';
    $('#previousStep').disabled = sceneIndex === 0 && step === 0;
    $('#cueText').textContent = cueLabel();
    $('#scrollCue').setAttribute('aria-label', cueLabel());
    $('.scene-position').textContent = String(sceneIndex + 1).padStart(2, '0') + ' / 08';
    document.body.dataset.scene = id;
    document.body.dataset.step = String(step);
    const heading = $('h1, h2', scene);
    $('#sceneAnnouncement').textContent = heading.textContent + (id === 'structure' ? '. ' + scopes[step] : id === 'guides' && step ? '. ' + $('.guide-card.is-current h3').textContent : id === 'faq' ? '. ' + $('.faq-list details[open] summary').textContent : '');
    if (focusHeading) heading.focus({ preventScroll: true });
  }
  function updateCue() {
    const label = cueLabel();
    $('#cueText').textContent = label;
    $('#scrollCue').setAttribute('aria-label', label);
  }
  function finishSceneMotion(record = sceneMotion) {
    if (!record || sceneMotion !== record) return;
    sceneMotion = null;
    record.animations.forEach(animation => animation.cancel());
    record.nodes.forEach(node => node.classList.remove('is-transitioning'));
    delete document.body.dataset.sceneTransition;
    render(record.focusHeading && !$('dialog[open]'));
    if (pendingNavigation) {
      const navigation = pendingNavigation;
      pendingNavigation = null;
      go(...navigation);
    } else if (record.pendingWheel && !$('dialog[open]')) {
      advance(record.direction);
    }
  }
  function startSceneMotion(from, to, direction, focusHeading) {
    const options = { duration: 560, easing: 'cubic-bezier(0.22, 0.7, 0.25, 1)', fill: 'both' };
    const nodes = [scenes[from.index], scenes[to.index]];
    const record = { from, to, direction, destination: 'to', focusHeading, nodes, animations: [] };
    sceneMotion = record;
    document.body.dataset.sceneTransition = direction > 0 ? 'next' : 'previous';
    record.animations = [
      nodes[0].animate([{transform:'translate3d(0,0,0)'}, {transform:'translate3d(0,' + -direction * 100 + '%,0)'}], options),
      nodes[1].animate([{transform:'translate3d(0,' + direction * 100 + '%,0)'}, {transform:'translate3d(0,0,0)'}], options)
    ];
    Promise.all(record.animations.map(animation => animation.finished)).then(() => finishSceneMotion(record), () => {});
  }
  function reverseSceneMotion(direction, focusHeading) {
    const record = sceneMotion;
    if (!record || direction === record.direction) return;
    record.pendingWheel = false;
    pendingNavigation = null;
    record.direction = direction;
    record.destination = record.destination === 'to' ? 'from' : 'to';
    record.focusHeading = focusHeading;
    const destination = record[record.destination];
    sceneIndex = destination.index;
    step = destination.step;
    render(false);
    record.animations.forEach(animation => animation.reverse());
    document.body.dataset.sceneTransition = direction > 0 ? 'next' : 'previous';
    history.replaceState(null, '', '#' + current().id);
  }
  function go(index, nextStep = 0, focusHeading = false, edge = 'start') {
    if (sceneMotion) {
      sceneMotion.pendingWheel = false;
      pendingNavigation = [index, nextStep, focusHeading, edge];
      return;
    }
    const from = { index: sceneIndex, step };
    const changedScene = index !== from.index;
    sceneIndex = Math.max(0, Math.min(scenes.length - 1, index));
    step = Math.max(0, Math.min(steps[current().id], nextStep));
    const animate = changedScene && !reducedMotion.matches;
    if (animate) [scenes[from.index], current()].forEach(node => node.classList.add('is-transitioning'));
    render(focusHeading && !animate);
    if (changedScene) content().scrollTop = edge === 'end' ? content().scrollHeight : 0;
    if (animate) startSceneMotion(from, {index:sceneIndex, step}, Math.sign(sceneIndex - from.index), focusHeading);
    updateCue();
    history.replaceState(null, '', '#' + current().id);
    closeMenu();
  }
  function advance(direction, focusHeading = false) {
    if (sceneMotion) { reverseSceneMotion(direction, focusHeading); return; }
    if (direction > 0) {
      if (step < steps[current().id]) go(sceneIndex, step + 1, false);
      else if (sceneIndex < scenes.length - 1) go(sceneIndex + 1, 0, focusHeading);
    } else {
      if (step > 0) go(sceneIndex, step - 1, false);
      else if (sceneIndex > 0) go(sceneIndex - 1, steps[scenes[sceneIndex - 1].id], focusHeading, 'end');
    }
  }
  function canScroll(el, direction) {
    return el.scrollHeight > el.clientHeight + 2 &&
      (direction > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2);
  }
  function shouldReadContent(direction) {
    // When the active illustration/panel fits on screen, reverse its steps in
    // place before moving the text above it. Taller panels remain scrollable.
    if (direction < 0 && step > 0) {
      const selector = { structure: '.room-figure', ai: '.survey-stage', field: '.field-demo', guides: '.guide-card.is-current', faq: '.faq-list' }[current().id];
      const panel = selector && $(selector, current());
      if (panel) {
        const rect = panel.getBoundingClientRect(), viewport = content().getBoundingClientRect();
        if (rect.top >= viewport.top - 2 && rect.bottom <= viewport.bottom + 2) return false;
      }
    }
    return canScroll(content(), direction);
  }
  function isolated(target) {
    return Boolean($('dialog[open]')) || header.classList.contains('menu-open') ||
      target.closest('input, textarea, select, [contenteditable="true"]');
  }
  window.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const now = performance.now();
    const delta = window.ScrollGestureGate.normalize(event.deltaY, event.deltaMode, content().clientHeight);
    if (!delta) return;
    if (isolated(event.target)) { gate.sample(delta, now); gate.block(now); return; }
    if (sceneMotion) {
      event.preventDefault();
      const direction = gate.sample(delta, now);
      if (direction === sceneMotion.direction) sceneMotion.pendingWheel = true;
      else if (direction) advance(direction);
      return;
    }
    const nativeScroll = content().contains(event.target) && shouldReadContent(Math.sign(delta));
    const direction = gate.sample(delta, now, { nativeScroll });
    if (!gate.allowNativeScroll) event.preventDefault();
    if (direction) advance(direction);
  }, { passive: false });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.classList.contains('menu-open')) { closeMenu(true); return; }
    if (isolated(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('button, a, summary') && [' ', 'Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? (event.shiftKey ? -1 : 1) : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
    if (!direction && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat) return;
    gate.block(performance.now());
    if (event.key === 'Home') go(0, 0, true);
    else if (event.key === 'End') go(scenes.length - 1, 0, true);
    else if (!sceneMotion && shouldReadContent(direction)) content().scrollBy({ top: direction * content().clientHeight * .75, behavior: 'instant' });
    else advance(direction, true);
  });
  document.addEventListener('touchstart', event => {
    touch = null;
    if (event.touches.length !== 1 || isolated(event.target) || event.target.closest('button, a, summary, label')) return;
    const point = event.touches[0];
    touch = { x: point.clientX, y: point.clientY, scrollTop: content().scrollTop, atTop: !!sceneMotion || !shouldReadContent(-1), atBottom: !!sceneMotion || !shouldReadContent(1), scene: sceneIndex };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1) return;
    const point = event.touches[0], dy = touch.y - point.clientY, dx = touch.x - point.clientX;
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) && ((dy > 0 && touch.atBottom) || (dy < 0 && touch.atTop))) event.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', event => {
    if (!touch || event.touches.length || !event.changedTouches.length) { touch = null; return; }
    const start = touch; touch = null;
    const point = event.changedTouches[0], dy = start.y - point.clientY, dx = start.x - point.clientX;
    if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy) || start.scene !== sceneIndex || Math.abs(start.scrollTop - content().scrollTop) > 2) return;
    if ((dy > 0 && start.atBottom) || (dy < 0 && start.atTop)) {
      gate.block(performance.now());
      advance(Math.sign(dy));
    }
  }, { passive: true });
  document.addEventListener('touchcancel', () => { touch = null; }, { passive: true });

  document.addEventListener('landing:login-open', () => {
    pendingNavigation = null;
    touch = null;
    if (sceneMotion) sceneMotion.pendingWheel = false;
    finishSceneMotion();
    closeMenu();
    gate.block(performance.now());
  });

  function openFieldGuide(opener) {
    pendingNavigation = null;
    if (sceneMotion) sceneMotion.pendingWheel = false;
    finishSceneMotion();
    dialogOpener = opener;
    closeMenu();
    gate.block(performance.now());
    dialog.showModal();
    $('.close-dialog', dialog).focus();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    const room = event.target.closest('[data-room-step]');
    const guide = event.target.closest('[data-guide-step]');
    const question = event.target.closest('.faq-list summary');
    if (question) {
      event.preventDefault(); gate.block(performance.now());
      go(scenes.findIndex(s => s.id === 'faq'), $$('.faq-list summary').indexOf(question));
      return;
    }
    if (event.target.closest('[data-field-guide]')) {
      event.preventDefault(); openFieldGuide(event.target.closest('[data-field-guide]')); return;
    }
    if (room || guide) {
      gate.block(performance.now());
      go(scenes.findIndex(s => s.id === (room ? 'structure' : 'guides')), Number(room ? room.dataset.roomStep : guide.dataset.guideStep));
      return;
    }
    if (link) {
      const id = link.hash.slice(1), index = scenes.findIndex(s => s.id === id);
      if (index !== -1) { event.preventDefault(); gate.block(performance.now()); go(index, 0, true); }
      if (id === 'main') { event.preventDefault(); $('h1, h2', current()).focus({ preventScroll: true }); }
      closeMenu();
    }
  });
  $('#aiToggle').addEventListener('click', () => {
    gate.block(performance.now()); go(sceneIndex, step ? 0 : 1);
  });
  $$('input[name="example-mood"]').forEach(radio => radio.addEventListener('change', () => {
    gate.block(performance.now()); go(sceneIndex, 1);
  }));
  $('#scrollCue').addEventListener('click', () => {
    gate.block(performance.now());
    if (sceneMotion) { advance(1, true); return; }
    if (current().id === 'start') go(0, 0, true);
    else advance(1, true);
  });
  $('#previousStep').addEventListener('click', () => { gate.block(performance.now()); advance(-1, true); });
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open)); header.classList.toggle('menu-open', open);
  });
  $$('.close-dialog, .dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    gate.block(performance.now());
    // On mobile, reopen the navigation so its initiating link can receive focus.
    if (dialogOpener && $('#siteNav').contains(dialogOpener) && matchMedia('(max-width: 800px)').matches) {
      header.classList.add('menu-open'); menu.setAttribute('aria-expanded', 'true');
    }
    dialogOpener?.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#field-access') { openFieldGuide(null); return; }
    const index = scenes.findIndex(s => '#' + s.id === location.hash);
    if (index !== -1) { gate.block(performance.now()); go(index, 0, true); }
  });
  const initial = scenes.findIndex(s => '#' + s.id === location.hash);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finishSceneMotion(); });
  scenes.forEach(scene => $('.scene-content', scene).addEventListener('scroll', () => {
    if (scene === current()) updateCue();
  }, { passive: true }));
  if (initial !== -1) sceneIndex = initial;
  document.body.classList.add('enhanced');
  menu.hidden = false;
  $('.scene-controls').hidden = false;
  render();
  if (location.hash === '#field-access') openFieldGuide(null);
})();
