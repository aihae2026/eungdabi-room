const status = document.querySelector('#status');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const input = document.querySelector('#pageNumber');
const zoom = document.querySelector('#zoom');
let pdf, current = 1, sequence = 0, rendering;
async function render() {
  const id = ++sequence;
  if (rendering) { rendering.cancel(); rendering = null; }
  previous.disabled = current === 1;
  next.disabled = current === pdf.numPages;
  input.value = current;
  status.textContent = `${current}페이지를 불러오는 중…`;
  try {
    const page = await pdf.getPage(current);
    if (id !== sequence) return;
    const base = page.getViewport({ scale: 1 });
    const scale = zoom.value === 'fit' ? Math.min((document.querySelector('#reader').clientWidth - 32) / base.width, 1.5) : Number(zoom.value);
    const viewport = page.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    document.querySelector('#paper').replaceChildren(canvas);
    rendering = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    await rendering.promise;
    if (id !== sequence) return;
    rendering = null;
    const text = await page.getTextContent();
    if (id !== sequence) return;
    document.querySelector('#pageText').textContent = text.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
    status.textContent = `${pdf.numPages}페이지 중 ${current}페이지`;
  } catch (error) {
    if (id !== sequence || error.name === 'RenderingCancelledException') return;
    status.textContent = '페이지를 표시하지 못했습니다. 다른 페이지로 이동하거나 새로고침해 주세요.';
  }
}
try {
  const lib = await import('./vendor/pdfjs/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
  pdf = await lib.getDocument({url: new URL('./guides/user-guide-v1.0.pdf', import.meta.url).href, cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href, wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href, isEvalSupported: false}).promise;
  input.max = pdf.numPages; input.disabled = false; zoom.disabled = false;
  document.querySelector('#pageCount').textContent = `/ ${pdf.numPages}`;
  previous.onclick = () => { if (current > 1) { current--; render(); } };
  next.onclick = () => { if (current < pdf.numPages) { current++; render(); } };
  input.onchange = () => { const value = Number(input.value); if (Number.isInteger(value) && value >= 1 && value <= pdf.numPages) { current = value; render(); } else input.value = current; };
  zoom.onchange = render;
  let timer; window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => { if (zoom.value === 'fit') render(); }, 150); });
  await render();
} catch (error) { status.textContent = '가이드를 불러오지 못했습니다. 새로고침하거나 PDF 다운로드를 이용해 주세요.'; }
