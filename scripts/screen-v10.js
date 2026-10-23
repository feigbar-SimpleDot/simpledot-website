/* ===== V10 屏2 feature 内多图切换模块 (UX-V10 §2/§3/§7.1):
       window.SAS_V10.shotPager = { boot, prev, next, resetAll }
       - 每张 sc-card 独立 currentIndex (互不共享); 切 feature 由 shell.setSubState 调 resetAll 归 0
       - 单图 feature (V11 后 = S1/S3 单真实图): pager data-empty 隐藏, 不渲染切换行为
       - dealing 互斥窗: MutationObserver 监听 .sc-stack.class → 窗内全部 shot-ctrl disabled + aria-busy
         (reduced-motion 不走 .dealing class, 天然全程可用 = AC-A04 兜底)
       - 键盘 ←/→: 仅当焦点在 .shot-body 内时翻图并 preventDefault (不劫持 rail 的 roving 与屏引擎)
       defer 序: 本文件在 shell/screen-v7 之后加载; DOM 在 defer 执行期已解析完, boot 即跑 */
(function(){
  if (window.SAS_V10) return;                        // 防重复挂载
  var cards = [];                                    // [{el, imgs, pager, dots, prev, next, credits, idx}]

  function reduceMotion(){
    return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  /* 单图状态: 图组内 <img> ≤1 张 → pager 隐藏 (data-empty), ctrl 全禁用 (UX-V10 §2.4) */
  function isSingle(st){ return st.imgs.length <= 1; }
  function setEdge(st){
    if (!st.prev || !st.next) return;
    if (st.busy){                                     // dealing 窗: 全禁用优先于边界态
      st.prev.disabled = true; st.next.disabled = true; return;
    }
    var first = st.idx <= 0, last = st.idx >= st.imgs.length - 1;
    st.prev.disabled = first;  st.prev.setAttribute('aria-disabled', first ? 'true' : 'false');
    st.next.disabled = last;   st.next.setAttribute('aria-disabled', last ? 'true' : 'false');
  }
  /* 呈现 currentIndex: 图 hidden 翻转 + pager 文本/圆点 + S4 版权行 currentFor 翻转 (无动画, 直切) */
  function render(st){
    for (var i=0;i<st.imgs.length;i++){
      if (i === st.idx) st.imgs[i].removeAttribute('hidden'); else st.imgs[i].setAttribute('hidden','');
      var zoom = st.imgs[i].closest && st.imgs[i].closest('.shot-zoom');   /* V11: 外层灯箱锚点同步翻 hidden
        (UX-V11 §3 共同规则: 翻 <a> 后 <img> 显隐随之成立; 双翻保 AC-A02 字面断言) */
      if (zoom){ if (i === st.idx) zoom.removeAttribute('hidden'); else zoom.setAttribute('hidden',''); }
    }
    if (st.pager){
      if (isSingle(st)){ st.pager.dataset.empty = 'true'; }
      else {
        st.pager.removeAttribute('data-empty');
        var cur = st.pager.querySelector('.shot-pager-cur');
        var tot = st.pager.querySelector('.shot-pager-total');
        if (cur) cur.textContent = String(st.idx + 1);
        if (tot) tot.textContent = String(st.imgs.length);
        var dots = st.pager.querySelectorAll('.dot');
        for (var d=0;d<dots.length;d++) dots[d].classList.toggle('is-active', d === st.idx);
      }
    }
    if (st.credits) for (var c=0;c<st.credits.length;c++){
      var forIdx = Number(st.credits[c].getAttribute('data-shot-credit-for'));
      if (forIdx === st.idx) st.credits[c].removeAttribute('hidden'); else st.credits[c].setAttribute('hidden','');
    }
    setEdge(st);
  }
  function step(st, delta){
    if (!st || isSingle(st)) return;
    if (st.el.getAttribute('aria-hidden') === 'true') return;  // 残影卡不可交互 (V8 R3.4 语义锁)
    var n = st.idx + delta;
    if (n < 0 || n > st.imgs.length - 1) return;     // 到边停, 不循环 (REQ R1.3)
    if (isBusy(st.el)) return;                        // 互斥窗双保险 (CSS pointer-events 之外的逻辑锁)
    st.idx = n;
    render(st);
  }
  /* dealing 互斥窗判定: 所在 stack 带 .dealing 即忙 */
  function isBusy(cardEl){
    var stack = cardEl.closest('.sc-stack');
    return !!(stack && stack.classList.contains('dealing'));
  }
  /* dealing 窗内 disabled + aria-busy (AC-A04); 窗结束按边界态复位 (render 重算) */
  function applyBusy(busy){
    for (var i=0;i<cards.length;i++){
      var st = cards[i];
      st.busy = busy;
      if (busy){
        if (st.prev){ st.prev.setAttribute('disabled',''); st.prev.setAttribute('aria-busy','true'); }
        if (st.next){ st.next.setAttribute('disabled',''); st.next.setAttribute('aria-busy','true'); }
      } else {
        if (st.prev) st.prev.removeAttribute('aria-busy');
        if (st.next) st.next.removeAttribute('aria-busy');
        render(st);                                   // setEdge 按 currentIndex 恢复正确 disabled 态
      }
    }
  }
  function stateOf(el){
    for (var i=0;i<cards.length;i++) if (cards[i].el === el) return cards[i];
    return null;
  }
  function boot(){
    var scEl = document.getElementById('screen-scenarios');
    if (!scEl) return;
    var cardEls = scEl.querySelectorAll('.sc-card');
    for (var i=0;i<cardEls.length;i++){
      var el = cardEls[i];
      var group = el.querySelector('.shot-group');
      var imgs = group ? group.querySelectorAll('img.sc-shot') : [];
      var pager = el.querySelector('.shot-pager');
      if (!imgs.length && !pager) continue;           // 无图组也无 pager (理论不出现), 跳过
      var st = {
        el: el, imgs: imgs, idx: 0, pager: pager,
        dots: pager ? pager.querySelectorAll('.dot') : [],
        prev: el.querySelector('.shot-ctrl-prev'),
        next: el.querySelector('.shot-ctrl-next'),
        credits: el.querySelectorAll('.shot-credit')
      };
      if (!st.prev || !st.next) {                     // 单图 feature 静态不渲染 ctrl (UX-V10 §3.1): pager 兜空
        if (pager) pager.dataset.empty = 'true';
        cards.push(st); render(st); continue;
      }
      cards.push(st);
      render(st);                                     // 初始: idx=0, 边界 disabled, pager/credit 对齐
    }
    /* 图加载失败降级 (UX-V10 降级档 C): 隐 img + 动态兜底 SVG + pager 置空; 仅 warn 不抛错 */
    var imgsAll = scEl.querySelectorAll('.shot-group img.sc-shot');
    for (var m=0;m<imgsAll.length;m++){
      (function(img){
        img.addEventListener('error', function(){
          img.style.display = 'none';
          var za = img.closest && img.closest('.shot-zoom');
          if (za) za.setAttribute('data-failed','');     /* V11 (UX-V11 §2.8): 失败图锚点不再弹灯箱, 点击走原生链接 */
          var g = img.closest('.shot-group');
          if (g && !g.querySelector('svg.shot-icon')){
            var ns = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('class','shot-icon'); svg.setAttribute('viewBox','0 0 64 64');
            svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor');
            svg.setAttribute('stroke-width','1.5'); svg.setAttribute('aria-hidden','true');
            var r = document.createElementNS(ns, 'rect');
            r.setAttribute('x','6'); r.setAttribute('y','10'); r.setAttribute('width','52');
            r.setAttribute('height','40'); r.setAttribute('rx','4'); r.setAttribute('opacity','.6');
            svg.appendChild(r); g.appendChild(svg);
          }
          var card = img.closest('.sc-card');
          var st = stateOf(card);
          if (st && st.pager) st.pager.dataset.empty = 'true';
          if (window.console && console.warn) console.warn('[SAS_V10] shot image failed:', img.getAttribute('src'));
        });
      })(imgsAll[m]);
    }
    /* 点击翻页 (document 级委托, 与 shell 各控件互不冲突) */
    document.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('.shot-ctrl');
      if (!b) return;
      var st = stateOf(b.closest('.sc-card'));
      if (!st) return;
      step(st, b.classList.contains('shot-ctrl-prev') ? -1 : 1);
    });
    /* 键盘 ←/→: 焦点在 shot-body / shot-ctrl / shot-pager 内才翻图; 阻止默认防屏引擎/滚动 */
    document.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var body = e.target && e.target.closest && e.target.closest('.shot-body');
      if (!body) return;                              // rail button 的 roving 由 shell 处理, 不越权
      var st = stateOf(body.closest('.sc-card'));
      if (!st || isSingle(st)) return;
      e.preventDefault();
      step(st, e.key === 'ArrowLeft' ? -1 : 1);
    });
    /* dealing 互斥窗联动: stack class 变化 → disabled/aria-busy 翻转 */
    var stack = scEl.querySelector('.sc-stack');
    if (stack && window.MutationObserver){
      new MutationObserver(function(){ applyBusy(stack.classList.contains('dealing')); })
        .observe(stack, { attributes: true, attributeFilter: ['class'] });
    }
    /* 残影卡焦点跳过 (UX-V10 §2.5): aria-hidden 卡内 shot-ctrl tabindex=-1, 升顶恢复 0 */
    function syncInert(el){
      var hidden = el.getAttribute('aria-hidden') === 'true';
      var ctrls = el.querySelectorAll('.shot-ctrl, .shot-zoom');   /* V11 (UX-V11 §7): 灯箱锚点同样残影跳过 */
      for (var k=0;k<ctrls.length;k++) ctrls[k].setAttribute('tabindex', hidden ? '-1' : '0');
    }
    for (var q=0;q<cards.length;q++){
      (function(st){
        syncInert(st.el);
        if (window.MutationObserver)
          new MutationObserver(function(){ syncInert(st.el); })
            .observe(st.el, { attributes: true, attributeFilter: ['aria-hidden'] });
      })(cards[q]);
    }
  }
  /* 切 feature = 全部图组归首图 (REQ R1.3 决策; shell.setSubState 成功后同步调用) */
  function resetAll(){
    for (var i=0;i<cards.length;i++){ cards[i].idx = 0; render(cards[i]); }
  }
  window.SAS_V10 = { shotPager: { boot: boot, resetAll: resetAll,
    prev: function(el){ step(stateOf(el), -1); }, next: function(el){ step(stateOf(el), 1); } } };
  boot();
})();
