/* ===== V11 「点击查看原图」灯箱模块 (UX-V11 §2/§7):
       window.SAS_V11.lightbox = { boot, open, close, closeIfOpen, isOpen }
       - 触发基底 = <a.shot-zoom href target=_blank rel=noopener> 包 <img> (AC-C05: 无 JS 直达原图);
         JS 在场时 click 委托 preventDefault 转灯箱, 修饰键/中键放行 = 原生新标签页
       - 单例 #lightbox (role=dialog + aria-modal); 焦点位恰好两个: .lb-close ↔ .lb-opennew (手卷 Tab 圈禁, V6)
       - 关闭三通道: Esc / 遮罩 [data-lb-close] / 关闭钮; 焦点归还 lastTrigger (AC-C03)
       - open 期间 capture 键位仲裁矩阵 (UX-V11 §2.6): Esc 吞并关 / ←→↑↓ Space PgUp PgDn Home End 吞 / Tab 圈禁;
         capture 层首行 if (!openState) return = 关闭态对全站键位零侵入 (零回归红线)
       - 联动 (UX-V11 §2.8): rail 切 feature / 语言切换 → closeIfOpen (shell.js 与 data-lang MutationObserver);
         失败图锚点 data-failed 不弹灯箱 (screen-v10 onerror 打标); dealing 窗 / 残影卡禁弹
       - i18n: 锚点 aria-label = img.alt + ' · ' + t('shot.zoom.suffix') (V11 全文唯一拼接点, §4.2);
         灯箱 caption 从当前卡 figcaption 的 data-i18n 键 t() 注入; 零硬编码标签
       defer 序: 本文件在 screen-v10.js 之后 */
(function(){
  if (window.SAS_V11) return;                          // 防重复挂载
  var lb = null, lbImg = null, lbCap = null, lbNew = null, lbClose = null;
  var openState = false, lastTrigger = null;

  function t(key){
    var d = window.SAS_I18N || {};
    var lang = document.documentElement.getAttribute('data-lang') || 'zh';
    var m = d[lang] || d.zh || {};
    return m[key] != null ? m[key] : null;
  }
  /* 组合 aria-label = alt + ' · ' + suffix (UX-V11 §4.2; 语言切换后重算) */
  function composeLabels(){
    var suffix = t('shot.zoom.suffix') || '';
    var as = document.querySelectorAll('a.shot-zoom');
    for (var i=0;i<as.length;i++){
      var im = as[i].querySelector('img.sc-shot');
      if (!im) continue;
      var alt = im.getAttribute('alt') || '';
      as[i].setAttribute('aria-label', suffix ? (alt + ' · ' + suffix) : alt);
    }
  }
  /* 打开前置检查 (UX-V11 §2.2): 任一命中 = 不弹, 退化为 <a> 原生链接行为 */
  function canOpen(anchor){
    if (openState) return false;                        // 单例重入保护
    if (!anchor || anchor.hasAttribute('data-failed')) return false;   // 图加载失败锚点
    var card = anchor.closest('.sc-card');
    if (card && card.getAttribute('aria-hidden') === 'true') return false;  // 残影卡
    var stack = anchor.closest('.sc-stack');
    if (stack && stack.classList.contains('dealing')) return false;         // 换牌互斥窗 (AC-D05 语义)
    return true;
  }
  function open(anchor){
    if (!canOpen(anchor)) return false;
    lastTrigger = anchor;
    var im = anchor.querySelector('img.sc-shot');
    var href = anchor.getAttribute('href');
    lbImg.setAttribute('src', href);                    // 同源单档 (R-M1): <a href> = <img src> = 灯箱 src
    lbImg.setAttribute('alt', im ? (im.getAttribute('alt') || '') : '');
    lbNew.setAttribute('href', href);
    var card = anchor.closest('.sc-card');
    var fc = card ? card.querySelector('figcaption[data-i18n]') : null;
    var v = fc ? t(fc.getAttribute('data-i18n')) : null;
    lbCap.textContent = v != null ? v : (fc ? fc.textContent : '');
    lb.hidden = false;
    openState = true;
    document.documentElement.dataset.lbOpen = '1';      // CSS 兜底 overflow:hidden (移动端 rubber-band)
    lbClose.focus();
    return true;
  }
  function close(){
    if (!openState) return;
    openState = false;
    lb.hidden = true;
    delete document.documentElement.dataset.lbOpen;
    lbImg.removeAttribute('src');                       // 释放解码内存
    var f = lastTrigger; lastTrigger = null;
    if (f){
      try { f.focus({ preventScroll: true }); }         // 焦点归还触发锚点 (AC-C03)
      catch(e){ try { f.focus(); } catch(e2){} }        // 归还失败不抛错
    }
  }
  function closeIfOpen(){ if (openState) close(); }
  function boot(){
    lb = document.getElementById('lightbox');
    if (!lb) return;
    lbImg = lb.querySelector('.lb-img');
    lbCap = lb.querySelector('.lb-caption');
    lbNew = lb.querySelector('.lb-opennew');
    lbClose = lb.querySelector('.lb-close');
    composeLabels();
    /* 缩略图点击委托: 仅左键无修饰才 preventDefault 转灯箱 (UX-V11 §2.2 通道表) */
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a.shot-zoom');
      if (!a) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!canOpen(a)) return;
      e.preventDefault();
      open(a);
    });
    /* 关闭通道: 遮罩 [data-lb-close] + 关闭钮 (Esc 见 capture 层) */
    lb.addEventListener('click', function(e){
      if (lbClose.contains(e.target) || e.target === lbClose){ close(); return; }
      if (e.target.closest && e.target.closest('[data-lb-close]')) close();
    });
    /* 键位仲裁 capture 层 (UX-V11 §2.6): open 期吞键 + Tab 圈禁; 关闭态零侵入
       D-V11-1 (TEST-V11 AC-C02 修复): 原生 <a> 无 Space 激活语义 (Space = 滚动键, 对照实验
       证伪 impl D-7 harness 归因)。关闭态补 Space 分支: 焦点在 a.shot-zoom 时 Space 与 Enter
       同语义 → preventDefault (压掉原生滚动) + 走既有 open() 路径; 修饰键按下放行 (同 click
       委托口径)。打开态仍走下方仲裁矩阵 (Space 被吞, 不重入)。 */
    document.addEventListener('keydown', function(e){
      if (!openState){
        if (e.key === ' ' || e.key === 'Spacebar'){
          var za = e.target && e.target.closest && e.target.closest('a.shot-zoom');
          if (za && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && open(za)){
            e.preventDefault();                         // 打开成功才压原生滚动; 禁弹锚点保留滚动
          }
        }
        return;
      }
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); return; }  // 防同时触发 shell closeMenu
      if (e.key === 'Tab'){
        e.preventDefault(); e.stopPropagation();
        var list = [lbClose, lbNew];                    // 焦点位恰好两个, 两元素闭环
        var i = list.indexOf(document.activeElement);
        var n;
        if (i < 0) n = 0;
        else n = e.shiftKey ? (i === 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
        list[n].focus();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === ' ' || e.key === 'Spacebar' || e.key === 'PageUp' || e.key === 'PageDown' ||
          e.key === 'Home' || e.key === 'End'){
        e.preventDefault(); e.stopPropagation();        // 不翻图/不换 feature/不切屏
      }
    }, true);
    /* 打开期滚轮/触摸锁定 (遮罩层自身双保险; carousel 侧另有 isOpen() 守卫) */
    lb.addEventListener('wheel', function(e){ e.preventDefault(); }, { passive: false });
    lb.addEventListener('touchmove', function(e){ e.preventDefault(); }, { passive: false });
    /* 灯箱内图加载失败 = 静默关闭 + warn (UX-V11 §2.5 降级档) */
    lbImg.addEventListener('error', function(){
      if (!openState) return;
      if (window.console && console.warn) console.warn('[SAS_V11] lightbox image failed');
      close();
    });
    /* 语言切换联动 (V9 防御): data-lang 变更 → 重算组合 aria-label + 关闭灯箱
       (MutationObserver 微任务在 shell.switchLang 同步 applyLang 之后执行, alt 已是新语言) */
    if (window.MutationObserver){
      new MutationObserver(function(){ composeLabels(); closeIfOpen(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
    }
  }
  window.SAS_V11 = { lightbox: { boot: boot, open: open, close: close, closeIfOpen: closeIfOpen,
    isOpen: function(){ return openState; } } };
  boot();
})();
