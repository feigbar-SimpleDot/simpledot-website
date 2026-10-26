/* ===== V12 独立静态页脚本片 (faq.html / manual.html 共用; UX-V12 D2) =====
   i18n 应用 / 语言 / 主题 / 汉堡焦点圈闭 / FAQ 手风琴(多开+深链) / 手册 TOC(IO 高亮+移动折叠) / 复制。
   与 carousel/shell 零耦合 (shell.js 顶部 SAS_CAROUSEL 守卫在本页必然短路, 故独立实现);
   sas-lang / sas-theme 与主站同键 = 语言/主题跨页一致 (AC-E03)。 */
(function(){
  var dict = window.SAS_I18N || {zh:{},en:{}};
  function t(key, lang){ return dict[lang] && dict[lang][key] != null ? dict[lang][key] : (dict.en && dict.en[key] != null ? dict.en[key] : null); }
  function curLang(){ return document.documentElement.getAttribute('data-lang') || 'en'; }
  var reduceMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};

  /* ---------- i18n 应用 (与主站 shell.js applyLang 同实现, AC-E03) ---------- */
  function applyLang(lang){
    if (lang !== 'zh' && lang !== 'en') lang = 'en';
    var els = document.querySelectorAll('[data-i18n]');
    for (var i=0;i<els.length;i++){
      var v = t(els[i].getAttribute('data-i18n'), lang);
      if (v != null) els[i].textContent = v;
    }
    var htmls = document.querySelectorAll('[data-i18n-html]');
    for (var ih=0;ih<htmls.length;ih++){
      var hv = t(htmls[ih].getAttribute('data-i18n-html'), lang);
      if (hv != null) htmls[ih].innerHTML = hv;   /* V15: 译文含 <br> 行内标记 (man-quote), textContent 会转义故走 innerHTML */
    }
    var attrs = document.querySelectorAll('[data-i18n-attr]');
    for (var j=0;j<attrs.length;j++){
      var spec = (attrs[j].getAttribute('data-i18n-attr')||'').split(',');
      for (var s=0;s<spec.length;s++){
        var p = spec[s].split(':');
        if (p.length === 2){ var val = t(p[1], lang); if (val != null) attrs[j].setAttribute(p[0], val); }
      }
    }
    var lbs = document.querySelectorAll('[data-lang-btn]');
    for (var b=0;b<lbs.length;b++) lbs[b].setAttribute('aria-checked', lbs[b].getAttribute('data-lang-btn') === lang ? 'true':'false');
  }
  function switchLang(lang){
    var html = document.documentElement;
    html.setAttribute('data-lang', lang);
    html.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    applyLang(lang);
    html.classList.remove('i18n-pending');
    try { localStorage.setItem('sas-lang', lang); } catch(e) {}
  }

  /* ---------- 主题控制器 (V4 机制同构, sas-theme 同键) ---------- */
  function syncToggle(theme){
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i=0;i<btns.length;i++) btns[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  function applyTheme(theme, persist){
    var html = document.documentElement;
    html.setAttribute('data-theme', theme);
    var mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', theme === 'dark' ? '#0f0e10' : '#fbf9f6');
    if (persist) try { localStorage.setItem('sas-theme', theme); } catch(e) {}
    syncToggle(theme);
    document.dispatchEvent(new CustomEvent('sas:themechange', {detail:{theme:theme}}));  // logo.js 重取色钩子
  }
  var themeMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (themeMQ){
    var onSysTheme = function(ev){
      var saved = null; try { saved = localStorage.getItem('sas-theme'); } catch(e) {}
      if (saved !== 'light' && saved !== 'dark') applyTheme(ev.matches ? 'dark' : 'light', false);
    };
    if (themeMQ.addEventListener) themeMQ.addEventListener('change', onSysTheme);
    else if (themeMQ.addListener) themeMQ.addListener(onSysTheme);
  }

  /* ---------- 汉堡 + 焦点圈闭 (shell.js V4 F8 机制最小复制, 不引 carousel) ---------- */
  var burger = document.querySelector('.hamburger');
  var menu = document.getElementById('mobileMenu');
  var overlay = document.getElementById('menuOverlay');
  function closeMenu(returnFocus){
    if (!menu || !menu.classList.contains('open')) return;
    menu.classList.remove('open'); overlay.classList.remove('open');
    burger.setAttribute('aria-expanded','false');
    if (returnFocus !== false) burger.focus();
  }
  if (burger && menu && overlay){
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      overlay.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true':'false');
      if (open){ var f = menu.querySelector('a,button'); if (f) f.focus(); }
    });
    overlay.addEventListener('click', function(){ closeMenu(); });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ closeMenu(); return; }
      if (e.key === 'Tab' && menu.classList.contains('open')){
        var focusables = menu.querySelectorAll('a[href], button:not([disabled])');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length-1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- aria-live 播报区 ---------- */
  var live = document.getElementById('liveRegion');
  function announce(msg){ if (live) live.textContent = msg; }

  /* ---------- FAQ 手风琴: 多条同开 (D4, 无互斥); max-height 由 JS 写 scrollHeight (3.2) ---------- */
  function faqBody(item){ return item.querySelector('.faq-body'); }
  function setFaqOpen(item, open, announceIt){
    var body = faqBody(item);
    var btn = item.querySelector('.faq-btn');
    if (!body || !btn) return;
    item.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.style.maxHeight = open ? body.scrollHeight + 'px' : '0px';
    if (announceIt){
      var q = item.querySelector('.faq-btn [data-i18n]');
      var qs = q ? q.textContent : '';
      announce(qs + ' · ' + (t(open ? 'faqp.ann.open' : 'faqp.ann.close', curLang()) || ''));
    }
  }
  function toggleFaq(btn){
    var item = btn.closest('.faq-item');
    if (item) setFaqOpen(item, !item.classList.contains('open'), true);
  }
  /* 深链 (3.2/AC-C03/E04): load 时 hash 命中 → 展开 + 定位; 无效 hash 静默忽略 */
  function deeplinkFaq(){
    var items = document.querySelectorAll('.faq-item[id]');
    if (!items.length) return;
    var id = (location.hash || '').replace('#','');
    if (!id) return;
    var target = document.getElementById(id);
    if (!target || !target.classList.contains('faq-item')) return;   // 无效锚点: 顶部正常展示
    setFaqOpen(target, true, false);
    // 同步定位 (不走 rAF: 帧饥饿/无渲染环境下 rAF 永不触发; DOM 已解析, 布局即时可读)
    target.scrollIntoView({block:'start'});
  }
  /* resize 后已展开条目重测高 (防内容换行溢出 max-height) */
  window.addEventListener('resize', function(){
    var opens = document.querySelectorAll('.faq-item.open');
    for (var i=0;i<opens.length;i++){ var b = faqBody(opens[i]); if (b) b.style.maxHeight = b.scrollHeight + 'px'; }
  });

  /* ---------- 手册 TOC (4.2): 桌面 IO 高亮 / 移动 details 折叠 + 点条目后收起 ---------- */
  var toc = document.querySelector('.man-toc');
  if (toc){
    var det = toc.querySelector('details');
    var mqDesk = matchMedia('(min-width:1024px)');
    /* 移动初始折叠 (markup 带 open = 无 JS 常开可读; JS 在场按档收) */
    if (det && !mqDesk.matches) det.open = false;
    function highlight(id){
      var links = toc.querySelectorAll('a[href^="#"]');
      for (var i=0;i<links.length;i++)
        links[i].setAttribute('aria-current', links[i].getAttribute('href') === '#' + id ? 'true' : 'false');
    }
    toc.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      highlight(a.getAttribute('href').slice(1));            // IO 不可用时的点击高亮兜底 (D6)
      if (!mqDesk.matches && det) det.open = false;          // 移动: 跳转后自动收起 (4.2)
    });
    var entries = document.querySelectorAll('.man-entry[id]');
    if ('IntersectionObserver' in window && entries.length){
      var io = new IntersectionObserver(function(rows){
        for (var i=0;i<rows.length;i++) if (rows[i].isIntersecting) highlight(rows[i].target.id);
      }, {rootMargin:'-25% 0px -65% 0px'});
      for (var k=0;k<entries.length;k++) io.observe(entries[k]);
    }
  }

  /* ---------- 复制 (与 shell.js doCopy 同逻辑; html:not(.js) 下钮已被 CSS 隐藏) ---------- */
  function doCopy(btn){
    var block = btn.closest('.code-block');
    var code = block ? block.querySelector('code') : null;
    if (!code) return;
    var text = code.innerText;
    function ok(){
      btn.classList.add('copied');
      announce(t('pages.copy.done', curLang()) || 'Copied');
      setTimeout(function(){ btn.classList.remove('copied'); }, 2000);
    }
    function fallback(){
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        var done = document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) ok(); else fail();
      } catch(err){ fail(); }
    }
    function fail(){ btn.style.color = 'var(--danger)'; setTimeout(function(){ btn.style.color=''; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(ok).catch(fallback);
    } else fallback();
  }

  /* ---------- 点击委托: 语言 / 主题 / FAQ / 复制 ---------- */
  document.addEventListener('click', function(e){
    var lb = e.target.closest && e.target.closest('[data-lang-btn]');
    if (lb){ switchLang(lb.getAttribute('data-lang-btn')); return; }
    var tb = e.target.closest && e.target.closest('.theme-toggle');
    if (tb){
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark', true);
      return;
    }
    var fb = e.target.closest && e.target.closest('.faq-btn');
    if (fb){ toggleFaq(fb); return; }
    var cb = e.target.closest && e.target.closest('.copy-btn');
    if (cb){ doCopy(cb); return; }
  });

  /* ---------- boot ---------- */
  applyLang(curLang());
  document.documentElement.classList.remove('i18n-pending');
  syncToggle(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  deeplinkFaq();
})();
