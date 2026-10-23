/* ===== V5.2 轮播引擎核心 (INTERACTION-V5.2 §1~§4/§8): 状态机 + SNAP/REBOUND + hash =====
   四源合一: wheel/touch/键盘/导航点击全部汇入 goTo(); 屏切换 = transform 虚拟滚动, 主文档锁死不动。
   状态机 IDLE/TRACKING/WHEELING; 链式 pendingDir 上限 1; flipBusy/pendingPop/主题boot/双语/V5.1光效零触碰。
   对外 API: window.SAS_CAROUSEL (供 12b 输入片 / 12c 壳片消费) */
(function(){
  var dict = window.SAS_I18N || {zh:{},en:{}};
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function t(key, lang){ return dict[lang][key] != null ? dict[lang][key] : (dict.en[key] != null ? dict.en[key] : null); }
  function curLang(){ return document.documentElement.getAttribute('data-lang') || 'en'; }
  function fmt(s, vars){ return s.replace(/\{(\w+)\}/g, function(_,k){ return vars[k] != null ? vars[k] : ''; }); }
  function announce(msg){ var lr = document.getElementById('liveRegion'); if (lr) lr.textContent = msg; }
  function screenName(key){ return t('nav.screen.' + key, curLang()) || key; }

  var SCREENS = { platform:'screen-platform', scenarios:'screen-scenarios', start:'screen-start', contact:'screen-contact' };
  var ORDER = ['platform','scenarios','start','contact'];   // 环形页序 (V8: contact 第四屏, ARCH-V8 §4.1)
  var current = 'platform';
  var state = 'IDLE';                                // IDLE / TRACKING / WHEELING (§1)
  var pendingDir = 0;                                // WHEELING 期链式方向, 上限 1 页 (§1)
  var pendingPop = null;                             // WHEELING 期挂起后退目标 (REVIEW-V5 重要-2 保留)
  var activeCancel = null;                           // 在飞动画的即刻落位函数 (导航改向用, §6.2)
  var preMount = null;                               // V5.3 P1: TRACKING 期预挂载的目标屏 (消除跟手空窗)
  var accum = 0;                                     // 带符号累计位移量 (px, 下滚为正=下一页)
  var rafId = null;                                  // 唯一 rAF 槽: 落位即停, IDLE 零空转 (验收#13)
  var pillNav = null;                               // V6: 壳层胶囊导航已废 (C6), 导航源改 header 文字链
  var pillInd = null;
  var dealHook = null;                               // 发牌重放钩子 (12c 壳片注入, §10.4)

  /* V7 跟手期复用 --shift 管线 + 滚轮预挂: wheel 事件驱动 --shift 连续偏移
     (REQ-V7 §3.4, UX-V7 §6). 仅在 TRACKING(wheel) 状态有效.
     跟手期预挂载目标屏与触摸共用同一 preMountTarget, 由 wheelClaim 进入 TRACKING */
  var wheelClaim = null;                            /* function: 滚轮 TRACKING 期 preMount 改向 */

  /* 参数总表 §12 — 全部具名常量, 验收按此实测 */
  var WHEEL_THRESHOLD = 100;                        // 累计触发阈值 (px)
  var SNAP_DURATION = 520, SNAP_MIN = 200;           // 吸附 520ms; 中途 commit 按剩余比例缩至下限 200
  var REBOUND_DURATION = 320;                       // V7 P-3: 跟手模型下拒绝感由「画面已动」承担, 回弹 320ms (原 420ms -100), 回弹仍比吸附(520)快 ✓
  var SNAP_EASE = 'cubic-bezier(.2,0,0,1)';         // 禁过冲曲线 (§3.3)
  var EDGE_TOL = 1;                                 // 内滚边界判定容差 (§2.3)

  /* V6 导航 active 双向联动 (UX-V6 §7.1 A7 授权三处改动之一): 原胶囊 movePill/syncTabs 实现
     替换为 header 文字链 aria-current + .is-active (桌面链 + 移动菜单链同步); 调用点签名不变 */
  function updateNavActive(name){
    var links = document.querySelectorAll('.site-header [data-target], #mobileMenu [data-target]');
    for (var i=0;i<links.length;i++){
      var on = links[i].getAttribute('data-target') === name;
      links[i].classList.toggle('is-active', on);
      if (on) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }
  function movePill(name, instant){ updateNavActive(name); }   // 兼容引擎/12c 旧调用签名
  function syncTabs(name){ updateNavActive(name); }
  // 交错索引: 屏内顶层内容块按子序写 --i (每屏 ≤5 项, 级差 40ms; n>5 兜底 32ms)
  function indexBlocks(el){
    if (!el) return;
    var kids = el.children, n = kids.length;
    var step = n > 5 ? 32 : 40;
    el.style.setProperty('--stagger', step + 'ms');
    for (var i=0;i<n;i++) kids[i].style.setProperty('--i', i);
  }
  /* RV6-P0-1 可滚性守卫: overflow:hidden/clip 容器 scrollTop 恒 0, 让位即永久死区 —
     仅 {auto,scroll} 真可滚容器才允许让位 (V6 .screen overflow:hidden 下 sh>ch 仍让位的矛盾解除) */
  function yieldsScrollable(node){
    var oy = getComputedStyle(node).overflowY;
    return oy === 'auto' || oy === 'scroll';
  }
  /* 内滚让位硬规则 (§2.3/§5b): 阅读优先 —— 从节点向上找当前屏/折叠件内最近纵向可滚容器,
     滚动方向上还有余量(容差1px) → true, 引擎不接管不 preventDefault */
  function innerScrollYields(dir, node){
    while (node && node !== document.body){
      var cls = node.classList;
      if (cls && (cls.contains('screen') || cls.contains('acc-body')) &&
          yieldsScrollable(node) &&                    /* RV6-P0-1: 不可滚容器绝不让位 */
          node.scrollHeight > node.clientHeight + EDGE_TOL){
        if (dir > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - EDGE_TOL) return true;
        if (dir < 0 && node.scrollTop > EDGE_TOL) return true;
      }
      node = node.parentElement;
    }
    return false;
  }
  /* 环形最短弧 (V8 修复 A-5): 越半周取 prev, 否则 next; ORDER.length 驱动, 规避 3 屏硬编码 */
  function arcDir(curName, targetName){
    var d = (ORDER.indexOf(targetName) - ORDER.indexOf(curName) + ORDER.length) % ORDER.length;
    return d > ORDER.length / 2 ? -1 : 1;
  }
  function nextName(){ return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]; }
  function prevName(){ return ORDER[(ORDER.indexOf(current) - 1 + ORDER.length) % ORDER.length]; }

  /* ---------- 滑移动画核心 (§3): --shift 驱动, 0=当前页, ±1=阈值/落位点 ---------- */
  function setShift(el, v){ el.style.setProperty('--shift', String(v)); }
  function armSnap(el, dur){ el.style.setProperty('--snap-dur', dur + 'ms'); el.classList.add('snap'); }
  function clearSlideStyles(el){
    el.style.removeProperty('--shift');
    el.style.removeProperty('--snap-dur');
    el.style.removeProperty('transition');
    el.classList.remove('snap');
  }
  /* V5.3 P1 (TEST-V5.2 触摸空窗): TRACKING 预挂载 — p 首离 0 即把目标屏挂到对侧,
     跟手全程无虚空; commit 由 beginSlide 接管, rebound/cancel 卸载; 反向拖拽换挂对侧 */
  function preMountTarget(dir){
    if (preMount && preMount.dir === dir) return;
    if (preMount) unmountPreMount();
    var target = dir > 0 ? nextName() : prevName();
    var oldEl = document.getElementById(SCREENS[current]);
    var newEl = document.getElementById(SCREENS[target]);
    document.documentElement.style.setProperty('--slide-h', oldEl.clientHeight + 'px');  // H 实时取
    newEl.hidden = false;
    newEl.classList.add('sliding');            // .sliding 自带 opacity:1/visibility:visible, 不加 .pre: 跟手即可见
    setShift(newEl, dir);
    newEl.scrollTop = 0;
    preMount = { el: newEl, dir: dir };
  }
  function unmountPreMount(){
    if (!preMount) return;
    var el = preMount.el;
    el.classList.remove('sliding');
    clearSlideStyles(el);
    el.hidden = true;
    preMount = null;
  }
  /* 提交滑移起点: 旧屏挂 exiting 交错退场, 新屏预挂载到对侧起始位 (§3.1) */
  function beginSlide(dir, target){
    var oldEl = document.getElementById(SCREENS[current]);
    var newEl = document.getElementById(SCREENS[target]);
    var wasPre = !!(preMount && preMount.el === newEl && preMount.dir === dir);
    if (preMount && !wasPre) unmountPreMount();   // 兜底: 预挂的不是本次目标, 先卸
    document.documentElement.style.setProperty('--slide-h', oldEl.clientHeight + 'px');  // H 实时取不缓存
    oldEl.classList.remove('is-active');            // 容器透明度即刻交棒, 可见性由 .exiting 维持
    oldEl.classList.add('sliding','exiting');
    newEl.hidden = false;
    if (wasPre){
      preMount = null;                              // 已可见贴对侧: 跳过 .pre 免一帧黑闪, 滑移本身即进场
      newEl.classList.add('sliding','is-active');
      indexBlocks(newEl.querySelector('.screen-inner'));
      setShift(oldEl, 0); setShift(newEl, dir);
    } else {
      newEl.classList.add('sliding','pre','is-active');
      indexBlocks(newEl.querySelector('.screen-inner'));
      setShift(oldEl, 0); setShift(newEl, dir);      // 新屏对侧贴边 (下一页: +1 屏高, 下方跟入)
      newEl.scrollTop = 0;
      void newEl.offsetWidth;                       // 强制重排, 起始态生效后再挂过渡
      newEl.classList.remove('pre');
      newEl.classList.add('entering');              // M1 交错叠加在滑移之上 (§3.3)
    }
    return { oldEl: oldEl, newEl: newEl };
  }
  /* 落位收尾: 焦点防困 (§11) → 胶囊/hash/播报 commit 时刻即更新 (§6.1/§8) → 链式消费 */
  function finishSlide(target, pair){
    var ae = document.activeElement;
    pair.oldEl.hidden = true;
    pair.oldEl.classList.remove('sliding','exiting','is-active','entering');
    clearSlideStyles(pair.oldEl);
    pair.newEl.classList.remove('sliding','entering');
    pair.newEl.classList.add('is-active');
    clearSlideStyles(pair.newEl);
    if (ae && pair.oldEl.contains(ae)) pair.newEl.focus({ preventScroll: true });  // 焦点移出退场屏
    current = target;
    if (target === 'platform' && dealHook) dealHook();  // 落入屏1 重放发牌 (§10.4)
    syncTabs(target);
    movePill(target, reduceMQ.matches);           // 胶囊 440ms 与 SNAP 同帧启动 (§6.1)
    announce(fmt(t('screen.announce', curLang()) || 'Current screen: {s}', { s: screenName(target) }));
    state = 'IDLE';
    activeCancel = null;
    if (pendingDir){ var d = pendingDir; pendingDir = 0; goTo(d > 0 ? nextName() : prevName()); return; }  // 链式上限1
    if (pendingPop && pendingPop !== current){ var p = pendingPop; pendingPop = null; goTo(p, { skipPush: true }); }
  }
  /* SNAP: 从当前 p 走完剩余距离, 时长按剩余比例缩放 (下限 SNAP_MIN, §3.3) */
  function snapTo(dir, p0){
    var target = dir > 0 ? nextName() : prevName();
    var pair = beginSlide(dir, target);
    var dur = Math.max(SNAP_MIN, Math.round(SNAP_DURATION * (1 - Math.min(Math.abs(p0), 1))));
    armSnap(pair.oldEl, dur); armSnap(pair.newEl, dur);
    setShift(pair.oldEl, -dir); setShift(pair.newEl, 0);
    state = 'WHEELING';
    var timer = setTimeout(function(){ finishSlide(target, pair); }, dur + 40);
    activeCancel = function(){ clearTimeout(timer); finishSlide(target, pair); };
  }
  /* REBOUND: 当前屏从 p 动画回原位, 不改 hash/导航/播报 (§3.3/§8) */
  function rebound(p){
    var el = document.getElementById(SCREENS[current]);
    // V5.3: 预挂屏随回弹同步退回对侧 (同曲线), 避免即刻隐藏露底闪跳
    var pm = preMount;
    if (pm){
      pm.el.classList.add('sliding');
      void pm.el.offsetWidth;
      armSnap(pm.el, REBOUND_DURATION);
      setShift(pm.el, pm.dir);
      preMount = null;  // 所有权交还: 延时直接卸载 pm
      setTimeout(function(){
        if (pm.el.hidden) return;
        if (preMount && preMount.el === pm.el) return;  // 期间被重新预挂: 不卸, 新生命周期接管
        pm.el.classList.remove('sliding','snap'); clearSlideStyles(pm.el); pm.el.hidden = true;
      }, REBOUND_DURATION + 60);
    }
    el.classList.add('sliding');
    setShift(el, -p);                              // 与跟手期同式: 位移 = -p·H
    void el.offsetWidth;
    armSnap(el, REBOUND_DURATION);
    setShift(el, 0);
    state = 'WHEELING';
    var timer = setTimeout(function(){
      el.classList.remove('sliding');
      clearSlideStyles(el);
      state = 'IDLE';
      activeCancel = null;
      if (pendingDir){                                       // R3.2 修复 #2: 先消费 pendingDir (镜像 finishSlide, ARCH-V8 §5.2)
        var d = pendingDir; pendingDir = 0; goTo(d > 0 ? nextName() : prevName()); return;
      }
      if (pendingPop && pendingPop !== current){ var q = pendingPop; pendingPop = null; goTo(q, { skipPush: true }); }
    }, REBOUND_DURATION + 40);
    activeCancel = function(){ clearTimeout(timer);
      el.classList.remove('sliding'); clearSlideStyles(el); state = 'IDLE'; activeCancel = null; };
  }
  /* reduce: 瞬时换页 (§9) — 阈值判定仍生效, 动画时长归零 */
  function instantSwap(target, skipPush){
    unmountPreMount();                             // V5.3: 直切前清预挂, 防残留
    var oldEl = document.getElementById(SCREENS[current]);
    var ae = document.activeElement;
    oldEl.classList.remove('is-active');
    oldEl.hidden = true;
    var newEl = document.getElementById(SCREENS[target]);
    newEl.hidden = false;
    newEl.classList.add('is-active');
    newEl.scrollTop = 0;
    if (ae && oldEl.contains(ae)) newEl.focus({ preventScroll: true });
    if (!skipPush && history.pushState) history.pushState(null, '', '#' + target);
    if (!skipPush) pendingPop = null;
    if (target === 'platform' && dealHook) dealHook();  // 落入屏1 重放发牌 (§10.4)
    current = target;
    syncTabs(target);
    movePill(target, true);
    announce(fmt(t('screen.announce', curLang()) || 'Current screen: {s}', { s: screenName(target) }));
    pendingDir = 0;
    if (pendingPop && pendingPop !== current){ var p = pendingPop; pendingPop = null; goTo(p, { skipPush: true }); }
  }

  /* ---------- 统一入口 goTo() (§6.2): 四源共用一条翻页路径 ---------- */
  function goTo(target, opts){
    /* V11 (UX-V11 §2.4 双保险): 灯箱 open 期间任何源不得切屏 (遮罩层 wheel preventDefault 之外的逻辑锁) */
    if (window.SAS_V11 && window.SAS_V11.lightbox && window.SAS_V11.lightbox.isOpen()) return;
    opts = opts || {};
    if (!SCREENS[target] || target === current) return;
    if (state === 'WHEELING'){
      if (opts.viaNav){                            // 导航点击=明确意图: 即刻落位当前在飞动画, 改向新目标 (§6.2)
        pendingDir = 0;
        if (activeCancel){ var f = activeCancel; activeCancel = null; f(); }
        goTo(target, opts); return;                // 已落回 IDLE, 走全新 SNAP, 不排队等两轮
      }
      pendingDir = arcDir(current, target);         // 其余源: 只记 pending, 上限 1
      return;
    }
    if (state === 'TRACKING') return;              // 手指按住期间不响应外部跳转
    if (reduceMQ.matches){ instantSwap(target, opts.skipPush); return; }
    if (!opts.skipPush && history.pushState) history.pushState(null, '', '#' + target);  // commit 时刻压栈 (§8)
    if (!opts.skipPush) pendingPop = null;         // 主动导航作废挂起后退 (REVIEW-V5 重要-2 保留)
    snapTo(arcDir(current, target), 0);            // 点击/键盘: 全程 SNAP 520ms
  }

  /* hash 路由: popstate 走引擎最短弧, 未知值回落 platform; WHEELING 期 pendingPop 保留 (§8) */
  window.addEventListener('popstate', function(){
    var h = (location.hash || '').replace('#','');
    var target = SCREENS[h] ? h : 'platform';
    if (state === 'WHEELING'){ pendingPop = target; return; }
    goTo(target, { skipPush: true });
  });

  /* ---------- 对外 API (12b 输入片 / 12c 壳片) ---------- */
  window.SAS_CAROUSEL = {
    ORDER: ORDER, SCREENS: SCREENS,
    reduceMQ: reduceMQ,
    WHEEL_THRESHOLD: WHEEL_THRESHOLD,
    SNAP_DURATION: SNAP_DURATION, REBOUND_DURATION: REBOUND_DURATION,   // V8 R3.1: 供 12b 冷却公式引用 (ARCH-V8 §5.1)
    getState: function(){ return state; },
    setState: function(s){ state = s; },               // 12b 输入片切入 TRACKING 用
    pending: function(d){ pendingDir = d; },           // WHEELING 期记链式方向 (上限1, §1)
    getPending: function(){ return pendingDir; },
    getCurrent: function(){ return current; },
    setCurrent: function(name){ current = name; },
    nextName: nextName, prevName: prevName, arcDir: arcDir,
    innerScrollYields: innerScrollYields,
    goTo: goTo, snapTo: snapTo, rebound: rebound, instantSwap: instantSwap,
    preMountTarget: preMountTarget, unmountPreMount: unmountPreMount,  // V5.3: 12b TRACKING 预挂载
    getPreMount: function(){ return preMount; },
    syncTabs: syncTabs, movePill: movePill, indexBlocks: indexBlocks,
    announce: announce, setDealCards: function(fn){ dealHook = fn; },
    setRaf: function(id){ rafId = id; }, getRaf: function(){ return rafId; },
    setAccum: function(v){ accum = v; }, getAccum: function(){ return accum; },
    /* V7 P-3 跟手期 API: 12b 输入片在跟手期调 setShiftForTrack 与 preMount 反向换挂 */
    setShift: setShift, armSnap: armSnap, clearSlideStyles: clearSlideStyles
  };
})();
