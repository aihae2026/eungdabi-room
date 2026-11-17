function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'intake' ? 'intake' : 'index';
  const title = page === 'intake' ? '생활안전점검 체크리스트 제출' : '생활안전점검 어드민';

  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
