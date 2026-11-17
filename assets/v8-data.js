/* Pure presentation helpers; callers supply the server-authorized institution list. */
((root) => {
  function scopeStats(rows, institutions, filters = {}) {
    const byCode = new Map(rows.map((row) => [row.institution_code, row]));
    return institutions.filter((o) => (!filters.agencyCode || o.code === filters.agencyCode) && (!filters.sido || o.sido === filters.sido) && (!filters.sigungu || o.sigungu === filters.sigungu)).map((o) => ({
      total: 0, unique_clients: 0, ...byCode.get(o.code),
      institution_code: o.code, institution_name: o.name, sido: o.sido, sigungu: o.sigungu,
    }));
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  const api = {scopeStats, csvCell};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.V8Data = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
