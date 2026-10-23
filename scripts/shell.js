/* ===== V6 应用壳片: i18n应用 / 点击→引擎 / 卡堆 / 复制 / 主题 / 页内态 / 汉堡 / boot =====
   导航点击统一 goTo(viaNav) 进引擎最短弧; 页内态 setSubState 独立状态机 (不经 goTo, 不劫持滚轮);
   汉堡焦点圈闭 = V4 F8 机制原样回收 (UX-V6 §7.2); 卡堆 flipBusy 锁不变 */
(function(){
  var C = window.SAS_CAROUSEL;
  if (!C) return;
  var dict = window.SAS_I18N || {zh:{},en:{}};
  var reduceMQ = C.reduceMQ;
  function t(key, lang){ return dict[lang][key] != null ? dict[lang][key] : (dict.en[key] != null ? dict.en[key] : null); }
  function curLang(){ return document.documentElement.getAttribute('data-lang') || 'en'; }
  function fmt(s, vars){ return s.replace(/\{(\w+)\}/g, function(_,k){ return vars[k] != null ? vars[k] : ''; }); }

  /* ---------- i18n 应用 (机制继承 V1~V4) ---------- */
  function applyLang(lang){
    if (lang !== 'zh' && lang !== 'en') lang = 'en';
    var els = document.querySelectorAll('[data-i18n]');
    for (var i=0;i<els.length;i++){
      var v = t(els[i].getAttribute('data-i18n'), lang);
      if (v != null) els[i].textContent = v;
    }
    var attrs = document.querySelectorAll('[data-i18n-attr]');
    for (var j=0;j<attrs.length;j++){
      var spec = attrs[j].getAttribute('data-i18n-attr').split(',');
      for (var s=0;s<spec.length;s++){
        var p = spec[s].split(':');
        if (p.length === 2){ var val = t(p[1], lang); if (val != null) attrs[j].setAttribute(p[0], val); }
      }
    }
    var lbs = document.querySelectorAll('[data-lang-btn]');
    for (var b=0;b<lbs.length;b++) lbs[b].setAttribute('aria-checked', lbs[b].getAttribute('data-lang-btn') === lang ? 'true':'false');
  }
  window.switchLang = function(lang){
    var html = document.documentElement;
    html.setAttribute('data-lang', lang);
    html.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    applyLang(lang);
    html.classList.remove('i18n-pending');
    try { localStorage.setItem('sas-lang', lang); } catch(e) {}
    /* 语言切换不触发屏/态重置 (AC-V6-11): 只换文案, 不动状态机 */
  };

  /* ---------- 任务卡堆 (UX-V5 §4.2/§4.3, 机制不动; 锁判据 busy→state) ---------- */
  var stack = document.getElementById('cardstack');
  var order = [];                                   // order[slot-1] = card 元素; slot3 = 顶卡
  if (stack) {
    order = [stack.querySelector('[data-slot="1"]'), stack.querySelector('[data-slot="2"]'), stack.querySelector('[data-slot="3"]')];
  }
  function setSlot(card, slot){ card.setAttribute('data-slot', String(slot)); }
  function dealCards(){
    if (!stack || reduceMQ.matches) { if (stack) stack.classList.add('ghosted'); return; }
    stack.classList.remove('dealing','ghosted');
    void stack.offsetWidth;
    stack.classList.add('dealing');                 // 520ms×3 级差 120ms spring
    setTimeout(function(){ stack.classList.add('ghosted'); }, 760 + 200);  // 末卡落位后 200ms 淡入
  }
  C.setDealCards(dealCards);                        // 引擎落入屏1 时经 API 重放发牌 (§10.4)
  function topCard(){ return order[2]; }
  function cardTag(card){ return t('card' + card.getAttribute('data-card') + '.tag', curLang()) || ''; }
  function announceCard(){
    var c = topCard();
    C.announce(fmt(t('card.announce', curLang()) || 'Card {n}: {t}', { n: c.getAttribute('data-card'), t: cardTag(c) }));
  }
  var flipBusy = false;                           // 翻牌锁 (REVIEW-V5 重要-1): 归队窗口内禁再翻, 防双 timer 写同槽
  function flipNext(){
    if (!stack || C.getState() !== 'IDLE' || flipBusy) return;   // 页移与翻牌不同时动 (§1)
    flipBusy = true;
    var top = order[2];                            // 出列顶卡 c3
    // 前移一位: c1→slot2, c2→slot3(新顶), 出列卡补队尾 slot1 → [c3,c1,c2]
    var next = [top, order[0], order[1]];
    if (reduceMQ.matches){                        // reduce: 直换 z 与可见卡, 无动画
      order = next;
      setSlot(order[0],1); setSlot(order[1],2); setSlot(order[2],3);
      flipBusy = false;                           // 无 timer 分支, 同步复位翻牌锁
      announceCard(); return;
    }
    top.classList.add('flip-out');                // 让位 280ms 加速离开
    setSlot(order[0], 2); setSlot(order[1], 3);   // 其余两卡 spring 前移
    setTimeout(function(){                        // 出列卡 60% 时无动画归队 (被遮挡窗口内)
      top.classList.remove('flip-out');
      top.style.transition = 'none';
      setSlot(top, 1);
      void top.offsetWidth;
      top.style.transition = '';
      flipBusy = false;                           // 归队完成才解锁, 槽位恒合法
    }, 168);
    order = next;
    announceCard();
  }
  function flipPrev(){
    if (!stack || C.getState() !== 'IDLE' || flipBusy) return;   // 同锁纪律: 归队窗口内禁逆旋
    // 逆旋: 队尾卡升顶 → [c2,c3,c1]
    order = [order[1], order[2], order[0]];
    setSlot(order[0],1); setSlot(order[1],2); setSlot(order[2],3);
    announceCard();
  }

  /* ---------- 页内态切换 setSubState (V7 屏2 槽位轮换换牌动效, UX-V7 §5):
       V6 旧行为: 块切换 = hidden 直切 + opacity/transform 交错 (180/240ms=320ms).
       V7 新行为: 三卡常驻 DOM, 改 .slot-* class 让 CSS transition 走 480/600ms 槽位轮换
       (总 660ms 60+600, 互斥锁 680ms, reduced-motion ≤50ms 直切).
       屏3 仍走 V6 hidden 路径 (UNCHANGED). */
  var SUB_META = {
    scenarios:{ states:['stab.s1','stab.s2','stab.s3','stab.s4'], v7:true },   /* V10: +stab.s4 (第4 feature) */
    start:{ states:['stab.deploy','stab.onb','stab.bound'] }
  };
  var subState = { scenarios: 0, start: 0 };       // 态存内存: 不进 URL/不进 storage (UX-V6 §2)
  var subBusy = false;
  function subRailBtn(screen){
    return document.querySelectorAll('#screen-' + screen + ' .sc-rail button');
  }
  function subLegacyBtn(screen){
    return document.querySelectorAll('#screen-' + screen + ' .subnav button');
  }
  function subBtnForScreen(screen){
    return SUB_META[screen] && SUB_META[screen].v7 ? subRailBtn(screen) : subLegacyBtn(screen);
  }
  function setSubState(screen, k){
    k = Number(k);
    if (subBusy || !(k >= 0) || k >= SUB_META[screen].states.length || k === subState[screen]) return;
    var scEl = document.getElementById('screen-' + screen);
    if (!scEl) return;
    if (SUB_META[screen].v7){
      var stack = scEl.querySelector('.sc-stack');
      if (!stack) return;
      var cards = stack.querySelectorAll('.sc-card');
      if (cards.length < 3) return;
      subState[screen] = k;
      // aria-current 翻转 (rail button 唯一 true)
      var btns = subBtnForScreen(screen);
      for (var b=0;b<btns.length;b++){
        var on = Number(btns[b].getAttribute('data-sub')) === k;
        btns[b].setAttribute('aria-current', on ? 'true' : 'false');
      }
      // 高亮条移动
      var rail = scEl.querySelector('.sc-rail');
      if (rail) v7_position(rail, k);
      // 播报「屏名 · 态名」
      var sName = t('nav.screen.' + screen, curLang()) || screen;
      var stName = t(SUB_META[screen].states[k], curLang()) || '';
      C.announce(fmt(t('announce.state', curLang()) || '{s} · {st}', { s: sName, st: stName }));
      if (reduceMQ.matches){
        // reduced-motion: 槽位直切 ≤50ms, 不走 .dealing
        v7_assignSlots(cards, k);
        v11_closeLightbox();                          /* V11: 先关灯箱再归首图 (UX-V11 §2.8) */
        v10_resetPager();                             /* V10: 切 feature 图组归首图 (REQ R1.3) */
        return;
      }
      subBusy = true;
      v7_assignSlots(cards, k);
      v11_closeLightbox();                            /* V11: 先关灯箱再归首图 (UX-V11 §2.8) */
      v10_resetPager();                               /* V10: 切 feature 图组归首图 (REQ R1.3) */
      stack.classList.add('dealing');
      // 高度自适应: 顶卡 offsetHeight 同步到 stack
      var newTop = null;
      for (var c=0;c<cards.length;c++){
        if (cards[c].classList.contains('slot-a')){ newTop = cards[c]; break; }
      }
      if (newTop) stack.style.minHeight = newTop.offsetHeight + 'px';
      setTimeout(function(){
        stack.classList.remove('dealing');
        subBusy = false;            // 680ms 互斥窗 (60+600+20)
      }, 680);
      return;
    }
    // 屏3 走 V6 旧路径 (UNCHANGED)
    var wrap = scEl.querySelector('.screen-inner');
    var oldEl = document.getElementById('sub-' + screen + '-' + subState[screen]);
    var newEl = document.getElementById('sub-' + screen + '-' + k);
    if (!wrap || !oldEl || !newEl) return;
    var fromRight = k > subState[screen];
    subState[screen] = k;
    var btns2 = subBtnForScreen(screen);
    for (var i=0;i<btns2.length;i++){
      var on2 = Number(btns2[i].getAttribute('data-sub')) === k;
      btns2[i].setAttribute('aria-current', on2 ? 'true' : 'false');
    }
    positionSubInd(screen);
    var sName2 = t('nav.screen.' + screen, curLang()) || screen;
    var stName2 = t(SUB_META[screen].states[k], curLang()) || '';
    C.announce(fmt(t('announce.state', curLang()) || '{s} · {st}', { s: sName2, st: stName2 }));
    if (reduceMQ.matches){
      oldEl.hidden = true; newEl.hidden = false;
      newEl.scrollTop = 0;
      return;
    }
    subBusy = true;
    C.indexBlocks(oldEl); C.indexBlocks(newEl);
    oldEl.classList.add('state-out');
    setTimeout(function(){
      oldEl.classList.remove('state-out'); oldEl.hidden = true;
      newEl.hidden = false;
      newEl.classList.add('state-in', fromRight ? 'pre-from-right' : 'pre-from-left');
      void newEl.offsetWidth;
      newEl.classList.remove('pre-from-right', 'pre-from-left');
      newEl.scrollTop = 0;
      setTimeout(function(){
        newEl.classList.remove('state-in');
        for (var cc=0;cc<newEl.children.length;cc++) newEl.children[cc].style.removeProperty('--i');
        subBusy = false;
      }, 240 + 2 * 40 + 20);
    }, 180 + 2 * 40 + 20);
  }
  /* V7 槽位分配 + rail 高亮条定位由 12d-app-v7.js 暴露 SAS_V7 模块提供;
       defer 序: shell 执行时 SAS_V7 已由文档序加载, 此处 lazy getter 在调用时拉取 */
  function v7_assignSlots(cards, active){
    if (window.SAS_V7 && window.SAS_V7.assignSlots) window.SAS_V7.assignSlots(cards, active);
  }
  function v7_position(rail, k){
    if (window.SAS_V7 && window.SAS_V7.positionSubIndV7) window.SAS_V7.positionSubIndV7(rail, k);
  }
  /* V10 图组重置钩子 (lazy getter 同 V7 纪律; SAS_V10 未加载时静默跳过) */
  function v10_resetPager(){
    if (window.SAS_V10 && window.SAS_V10.shotPager) window.SAS_V10.shotPager.resetAll();
  }
  /* V11 灯箱同步关闭钩子 (UX-V11 §2.8: rail 切换 = 先关后切, 灯箱不残留 = AC-C04; 焦点归还发生在切牌前) */
  function v11_closeLightbox(){
    if (window.SAS_V11 && window.SAS_V11.lightbox) window.SAS_V11.lightbox.closeIfOpen();
  }
  /* 桌面滑动指示胶囊定位 (首帧/换态即时; 375 CSS 隐藏指示, 直接短路) — V6 */
  function positionSubInd(screen){
    var nav = document.querySelector('#screen-' + screen + ' .subnav');
    var ind = nav && nav.querySelector('.pill-ind');
    if (!ind || window.matchMedia('(max-width:767px)').matches) return;
    var btn = nav.querySelector('button[data-sub="' + subState[screen] + '"]');
    if (!btn) return;
    ind.style.setProperty('--pill-x', btn.offsetLeft + 'px');
    ind.style.setProperty('--pill-w', btn.offsetWidth + 'px');
  }
  /* 屏首次激活时即时定位指示胶囊 (隐藏期 offsetWidth=0 → 入场前挂 no-anim 防滑入) */
  function showSubInd(screen){
    var scEl = document.getElementById('screen-' + screen);
    if (!scEl) return;
    if (SUB_META[screen] && SUB_META[screen].v7){
      var rail = scEl.querySelector('.sc-rail');
      if (!rail) return;
      rail.classList.add('no-anim');
      v7_position(rail, subState[screen]);
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ rail.classList.remove('no-anim'); }); });
      return;
    }
    var nav = scEl.querySelector('.subnav');
    if (!nav) return;
    nav.classList.add('no-anim');
    positionSubInd(screen);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ nav.classList.remove('no-anim'); }); });
  }
  var subIndObserver = new MutationObserver(function(muts){
    muts.forEach(function(m){
      var el = m.target;
      if (el.classList.contains('is-active') && !el.hidden){
        showSubInd(el.id.replace('screen-',''));
      }
    });
  });
  ['scenarios','start'].forEach(function(s){
    var el = document.getElementById('screen-' + s);
    if (el && window.MutationObserver) subIndObserver.observe(el, { attributes: true, attributeFilter: ['class','hidden'] });
  });
  window.SAS_SUB = { set: setSubState, get: function(s){ return subState[s]; } };

  /* ---------- 汉堡 + 移动菜单 (V4 F8 焦点圈闭机制整搬, UX-V6 §7.2) ---------- */
  var burger = document.querySelector('.hamburger');
  var menu = document.getElementById('mobileMenu');
  var overlay = document.getElementById('menuOverlay');
  function closeMenu(returnFocus){
    if (!menu.classList.contains('open')) return;
    menu.classList.remove('open'); overlay.classList.remove('open');
    burger.setAttribute('aria-expanded','false');
    if (returnFocus !== false) burger.focus();       // 焦点归还汉堡 (AC-V6-04)
  }
  if (burger){
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      overlay.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true':'false');
      if (open){ var f = menu.querySelector('a,button'); if (f) f.focus(); }
    });
    overlay.addEventListener('click', function(){ closeMenu(); });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ closeMenu(); return; }
      if (e.key === 'Tab' && menu.classList.contains('open')){   // 焦点圈闭: 尾↔首环回
        var focusables = menu.querySelectorAll('a[href], button:not([disabled])');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length-1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- 输入源 ④: 导航/点击 → 引擎最短弧 (§6.2; header 文字链 = 新导航源) ---------- */
  document.addEventListener('click', function(e){
    var lb = e.target.closest && e.target.closest('[data-lang-btn]');
    if (lb){ window.switchLang(lb.getAttribute('data-lang-btn')); return; }
    var sb = e.target.closest && (e.target.closest('.subnav button') || e.target.closest('.sc-rail button'));      // 页内子态切换 (V7 屏2 = .sc-rail, V6 屏3 = .subnav)
    if (sb){
      var sec = sb.closest('.screen');
      if (sec) setSubState(sec.id.replace('screen-',''), sb.getAttribute('data-sub'));
      return;
    }
    var hd = e.target.closest && e.target.closest('.site-header [data-target], #mobileMenu [data-target]');
    if (hd){
      e.preventDefault();                                                  // hash 静态锚 → 引擎切屏
      closeMenu();                                                         // 菜单内点击 = 先导航后收 (UX-V6 §7.2)
      C.goTo(hd.getAttribute('data-target'), { viaNav: true }); return;
    }
    var gs = e.target.closest && e.target.closest('[data-goto]');
    if (gs){ C.goTo(gs.getAttribute('data-goto'), { viaNav: true }); return; }
    if (e.target.closest && e.target.closest('#cardNext')){ flipNext(); return; }
    if (e.target.closest && e.target.closest('#cardPrev')){ flipPrev(); return; }
    var tc = e.target.closest && e.target.closest('.tcard');
    if (tc && tc === topCard()){ flipNext(); return; }   // 点顶卡 = 下一张循环
    var cb = e.target.closest && e.target.closest('.copy-btn');
    if (cb){ doCopy(cb); return; }
    var ab = e.target.closest && e.target.closest('.acc-btn');
    if (ab){
      var acc = ab.parentElement;
      // 态C FAQ 互斥展开 (D8): data-exclusive 组内展开一条自动收起其余
      if (acc.hasAttribute('data-exclusive')){
        var siblings = acc.parentElement.querySelectorAll('.accordion.open[data-exclusive]');
        for (var x=0;x<siblings.length;x++){
          if (siblings[x] === acc) continue;
          siblings[x].classList.remove('open');
          siblings[x].querySelector('.acc-btn').setAttribute('aria-expanded', 'false');
        }
      }
      var open = acc.classList.toggle('open');
      ab.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
  });
  // 子 tab 条内 ←/→ 移焦并激活 (roving 简化版, UX-V6 §3.1); 不劫持上下键 (归屏引擎)
  document.addEventListener('keydown', function(e){
    var sb = e.target.closest && (e.target.closest('.subnav button') || e.target.closest('.sc-rail button'));
    if (!sb) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.altKey){
      e.preventDefault();
      var btns = subBtnForScreen(sb.closest('.screen').id.replace('screen-',''));
      var idx = Array.prototype.indexOf.call(btns, sb);
      var nxt = btns[(idx + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      nxt.focus(); setSubState(sb.closest('.screen').id.replace('screen-',''), nxt.getAttribute('data-sub'));
    }
  });

  /* ---------- 复制 (机制继承 V4: clipboard → execCommand 降级) ---------- */
  function doCopy(btn){
    var block = btn.closest('.code-block');
    var code = block ? block.querySelector('code') : null;
    if (!code) return;
    var text = code.innerText;
    function ok(){
      btn.classList.add('copied');
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

  /* ---------- 主题控制器 (V4 机制原样继承) ---------- */
  var themeMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function syncToggle(theme){
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i=0;i<btns.length;i++) btns[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  function applyTheme(theme, persist){
    var html = document.documentElement;
    html.classList.add('theme-anim');                 // 门控: 仅主动切换时启用 200ms 颜色过渡
    html.setAttribute('data-theme', theme);
    var mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', theme === 'dark' ? '#0f0e10' : '#fbf9f6');
    if (persist) try { localStorage.setItem('sas-theme', theme); } catch(e) {}
    syncToggle(theme);
    document.dispatchEvent(new CustomEvent('sas:themechange', {detail: {theme: theme}}));  // LOGO/星空重取色钩子
    setTimeout(function(){ html.classList.remove('theme-anim'); }, 350);
  }
  document.addEventListener('click', function(e){
    var tb = e.target.closest && e.target.closest('.theme-toggle');
    if (!tb) return;
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);   // 主题切换不重置屏与态 (AC-V6-11)
  });
  if (themeMQ){
    var onSysTheme = function(ev){
      var saved = null; try { saved = localStorage.getItem('sas-theme'); } catch(e) {}
      if (saved !== 'light' && saved !== 'dark') applyTheme(ev.matches ? 'dark' : 'light', false);
    };
    if (themeMQ.addEventListener) themeMQ.addEventListener('change', onSysTheme);
    else if (themeMQ.addListener) themeMQ.addListener(onSysTheme);
  }

  /* ---------- boot: 首帧纪律 (UX-V5 §12.4 + V6 子tab指示首帧定位) ---------- */
  applyLang(curLang());
  document.documentElement.classList.remove('i18n-pending');
  /* V8 contact 屏 (ARCH-V8 §4.6): 邮箱可见文本从 href 注水, href 为地址唯一真相 (grep 命中=1) */
  (function injectMailText(){
    var a = document.querySelector('a.ct-mail');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    a.textContent = href.replace(/^mailto:/i, '');   /* 一次性 boot 注水, 地址与语言无关 */
  })();
  syncToggle(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  // 带 hash 加载直达对应屏默认态A (§5.5): 无过渡, 首帧即目标屏
  var bootHash = (location.hash || '').replace('#','');
  if (C.SCREENS[bootHash] && bootHash !== 'platform'){
    document.getElementById('screen-platform').classList.remove('is-active');
    document.getElementById('screen-platform').hidden = true;
    var be = document.getElementById(C.SCREENS[bootHash]);
    be.hidden = false; be.classList.add('is-active');
    C.setCurrent(bootHash);
    C.syncTabs(bootHash);
  } else {
    C.syncTabs('platform');
  }
  positionSubInd('scenarios'); positionSubInd('start');   // 子tab指示胶囊首帧定位 (含 V7 屏2 rail 隐式定位)
  // V7 屏2: 三卡 DOM 已在 (slot-a/b/c 静态默认), 但需确保 active 与 rail aria-current 对齐 + 真实宽度填充
  (function(){
    var scEl = document.getElementById('screen-scenarios');
    if (!scEl) return;
    var cards = scEl.querySelectorAll('.sc-card');
    if (cards.length >= 3){ v7_assignSlots(cards, subState.scenarios || 0); }
  })();
  window.addEventListener('resize', function(){           // 视口变化后指示胶囊重定位 (防错位)
    positionSubInd('scenarios'); positionSubInd('start');
    var scEl = document.getElementById('screen-scenarios');     // V7 屏2: rail 高亮条也需重定位
    if (scEl){
      var rail = scEl.querySelector('.sc-rail');
      if (rail) v7_position(rail, subState.scenarios || 0);
    }
  });
  if (C.getCurrent() === 'platform') dealCards();          // 首屏发牌入场
})();
