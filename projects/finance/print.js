(function (global) {
  'use strict';

  function ensureHost() {
    var host = global.document.getElementById('finance-print-host');
    if (host) return host;
    host = global.document.createElement('div');
    host.id = 'finance-print-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '9999';
    host.style.background = 'rgba(0,0,0,0.4)';
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.padding = '24px';
    global.document.body.appendChild(host);
    return host;
  }

  function renderShadow(html) {
    var host = ensureHost();
    host.innerHTML = '';
    var container = global.document.createElement('div');
    container.style.background = '#fff';
    container.style.borderRadius = '12px';
    container.style.maxWidth = '960px';
    container.style.width = '100%';
    container.style.maxHeight = '90vh';
    container.style.overflow = 'auto';
    container.style.boxShadow = '0 25px 60px rgba(0,0,0,0.2)';

    var shadow = container.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;

    host.appendChild(container);
    return { host: host, shadow: shadow };
  }

  function buildPrintShell(contentHtml, meta) {
    var companyName = (meta && meta.companyName) || 'Finance';
    var logoUrl = (meta && meta.logoUrl) || '';
    var title = (meta && meta.title) || 'Print';
    var subtitle = (meta && meta.subtitle) || '';

    var logoBlock = logoUrl
      ? '<img src="' + logoUrl + '" alt="Logo" style="height:48px;" />'
      : '<div style="font-weight:700;font-size:18px;">' + companyName + '</div>';

    return (
      '<style>' +
      '*{box-sizing:border-box;font-family:Arial,sans-serif;}' +
      '.page{padding:32px;color:#111;}' +
      '.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:16px;margin-bottom:16px;}' +
      '.title{font-size:20px;font-weight:700;margin:0;}' +
      '.subtitle{font-size:12px;color:#555;margin-top:4px;}' +
      '.footer{border-top:1px solid #eee;margin-top:24px;padding-top:12px;font-size:11px;color:#666;}' +
      '</style>' +
      '<div class="page">' +
      '  <div class="header">' +
      '    <div>' +
      '      <div class="title">' + title + '</div>' +
      (subtitle ? '      <div class="subtitle">' + subtitle + '</div>' : '') +
      '    </div>' +
      '    <div>' + logoBlock + '</div>' +
      '  </div>' +
      '  <div>' + contentHtml + '</div>' +
      '  <div class="footer">' + companyName + '</div>' +
      '</div>'
    );
  }

  function closePrint() {
    var host = global.document.getElementById('finance-print-host');
    if (host) host.remove();
  }

  function printHtml(contentHtml, meta) {
    var shell = buildPrintShell(contentHtml, meta || {});
    var rendered = renderShadow(shell);
    rendered.host.addEventListener('click', function (evt) {
      if (evt.target === rendered.host) closePrint();
    });
  }

  global.FinancePrint = {
    printHtml: printHtml,
    close: closePrint
  };
})(window);
