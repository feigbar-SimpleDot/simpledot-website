/* ===== V7 输入源片 (§2 wheel / §3+§5 touch / §5b 键盘): 全部汇入 SAS_CAROUSEL 引擎 =====
   wheel (V7 P-3): 跟手连续位移 (复用触摸 --shift 管线), 空闲 120ms 裁决 SNAP/REBOUND,
     删链式 pending (一次手势单屏). 触摸管线和键盘不变.
   wheel: passive:false + deltaMode 归一化 + 阈值100px + 120ms 空闲 → 跟手 / commit / rebound
   touch: 10px slop + 轴向判定 + 末80ms速度判定, 与 wheel 同管线
   keyboard: ↑↓/PgUp/PgDn/Home/End 最短弧; 输入框与修饰键不劫持; 屏内原生滚动优先 */
(function(){
  var C = window.SAS_CAROUSEL;
  if (!C) return;
  var WHEEL_LINE = 33;                              // deltaMode=1 行归一化 (px/行, §12)
  var IDLE_DECAY_WAIT = 120;                        // V7 P-3: 跟手期 120ms 空闲 = commit 判据 (原 120ms 仍作 cooldown)
  var DRAG_SLOP = 10;                              // 触摸 slop: tap/长按保护 (§12)
  var DRAG_COMMIT_DIST = 50;                       // 释放距离判定 (§12)
  var DRAG_COMMIT_VEL = 0.5;                       // 释放速度判定 px/ms, 末80ms均值 (§12)
  var VEL_WINDOW = 80;
  /* V7 P-3 wheel 跟手期: 跟手直接映射 accum→--shift, 无 rAF/decay 缓动;
     wheelIdleTimer 唯一计时: 空闲 IDLE_DECAY_WAIT=120ms → 裁决 commit/rebound */
  var wheelIdleTimer = null;
  function clearWheelIdle(){ if (wheelIdleTimer){ clearTimeout(wheelIdleTimer); wheelIdleTimer = null; } }

  /* ---------- V7 P-3 wheel 跟手与裁决 ----------
     跟手期 (TRACKING): wheel 事件 → C.setAccum(钳 ±T) → C.setShift(el, -p)/preMount 同步 → 防 commit;
       C.setState 直接 set TRACKING (= 与触摸 owner 同名义); 见下 wheelClaim() 进入 TRACKING.
     空闲 120ms 一次性裁决: |accum|≥T → snapTo / <T → rebound. 一次连续滚只裁决 1 次 (一次手势单屏) */
  function wheelClaim(dir){
    if (C.getState() !== 'IDLE') return;
    C.setAccum(0);
    C.setState('TRACKING');
    C.preMountTarget(dir);                          // 复用 V5.3 触摸预挂
    if (!C.getRaf()) C.setRaf(requestAnimationFrame(wheelTrackFrame));
  }
  function wheelTrackFrame(){
    if (C.getState() !== 'TRACKING'){ C.setRaf(null); return; }
    var cur = C.getCurrent();
    var el = document.getElementById(C.SCREENS[cur]);
    el.classList.add('sliding');
    var p = C.getAccum() / C.WHEEL_THRESHOLD;
    if (p > 1) p = 1;
    if (p < -1) p = -1;
    C.setShift(el, -p);                              // 跟手 1:1 (UX-V7 §6.2)
    var pm = C.getPreMount && C.getPreMount();
    if (pm){
      pm.el.classList.add('sliding');
      C.setShift(pm.el, pm.dir - p);                // preMount 同步跟手: p=0 贴对侧, p=±1 落点
    }
    C.setRaf(requestAnimationFrame(wheelTrackFrame));
  }
  function wheelCommitOrRebound(){
    var acc = C.getAccum();
    var p = acc / C.WHEEL_THRESHOLD;
    if (p > 1) p = 1;
    if (p < -1) p = -1;
    var dir = acc > 0 ? 1 : -1;
    if (reduceMQ && reduceMQ.matches){
      // reduced-motion (UX-V7 §6.4): 离散瞬时 + 350ms 冷却门; 此处先 commit 再开冷却
      var target = dir > 0 ? C.nextName() : C.prevName();
      var el0 = document.getElementById(C.SCREENS[C.getCurrent()]);
      el0.classList.remove('sliding');
      el0.style.removeProperty('--shift');
      C.unmountPreMount && C.unmountPreMount();
      C.instantSwap(target);
      C.setState('IDLE');
      startWheelCooldown(350);
      return;
    }
    if (Math.abs(acc) >= C.WHEEL_THRESHOLD){
      /* D-RT-P0-3 修复: commit 时刻压栈 (与 touch commit / 键盘路径同款);
         历史兼容层 wheelCommit 已删 (ARCH-V8 R3.3) */
      if (history.pushState) history.pushState(null, '', '#' + (dir > 0 ? C.nextName() : C.prevName()));
      C.snapTo(dir, p);
      /* R3.1 修复 #1: 冷却 = 动画时长 + 40ms 收尾尾巴 + 50ms margin (确定性门禁, ARCH-V8 §5.1) */
      startWheelCooldown(C.SNAP_DURATION + 40 + 50);
    } else {
      C.rebound(p);
      startWheelCooldown(C.REBOUND_DURATION + 40 + 50);       // R3.1 修复 #1: 回弹 320 + 40 尾巴 + 50 margin
    }
    C.setAccum(0);
  }
  /* WHEELING 期 wheel 吞掉 (UX-V7 §6.3): 锁定期 wheel 一律 preventDefault 后整事件忽略 */
  function startWheelCooldown(dur){
    C.setState('WHEELING');
    setTimeout(function(){
      C.setState('IDLE');
      C.pending(0);                                 // D-RT-P0-2 修复: 改调引擎已暴露的 pending() (V7 改造时误写了不存在的 setter 名); 语义 = 冷却结束清零链式方向 (V7 P-3 D6)
    }, dur);
  }

  /* ---------- V7 P-3 输入源 ①: 滚轮 (跟手 + 一次手势单屏) ---------- */
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* WHEELING 状态枚举合法性补充: 12-app.js 切 WHEELING 时已带 state 字符串, 此处不必新建 */
  window.addEventListener('wheel', function(e){
    /* V11 CR-1 (UX-V11 §2.4/§2.6 双保险; AC-C06): 灯箱 open 期间滚轮整体短路。
       本文件的 deltaMode=2 / reduce 分支直调 instantSwap/snapTo 不经 carousel.goTo(),
       goTo 内的 isOpen() 守卫覆盖不到, 须在本监听入口同构加锁 */
    if (window.SAS_V11 && window.SAS_V11.lightbox && window.SAS_V11.lightbox.isOpen()) return;
    var st = C.getState();
    /* WHEELING 期: preventDefault + 整事件吞掉 (UX-V7 §6.3 一次手势单屏门禁 / 删链式 pending) */
    if (st === 'WHEELING'){ e.preventDefault(); return; }
    if (st === 'TRACKING'){                                    // 跟手期
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) return;          // 修饰键放行 (跟手期不参与)
      var dy = e.deltaY;
      if (!dy) return;
      if (Math.abs(e.deltaX) > Math.abs(dy)) return;           // 横向手势忽略 (跟手期)
      if (e.deltaMode === 2){                                  // 页模式: 直接 commit (无视阈值)
        clearWheelIdle();
        if (C.reduceMQ.matches){ C.instantSwap(dy > 0 ? C.nextName() : C.prevName()); startWheelCooldown(350); return; }
        C.setAccum(dy > 0 ? C.WHEEL_THRESHOLD : -C.WHEEL_THRESHOLD);
        wheelCommitOrRebound();
        return;
      }
      var inc = (e.deltaMode === 1 ? dy * WHEEL_LINE : dy);
      var prevAcc = C.getAccum();
      var newAcc = prevAcc + inc;
      /* 跟手钳 ±T (UX-V7 §6.2: p 饱和时不再过冲 = "甩到位" 手感) */
      if (newAcc > C.WHEEL_THRESHOLD) newAcc = C.WHEEL_THRESHOLD;
      if (newAcc < -C.WHEEL_THRESHOLD) newAcc = -C.WHEEL_THRESHOLD;
      C.setAccum(newAcc);
      /* 反向滚复位 (跟手期内: 反向滚回未越阈值则归零, 反向滚越阈值继续积累; 只取消/不变, 不创造反向跳跃) */
      if (prevAcc !== 0 && (newAcc * prevAcc < 0)){           // 过零: 不重置, 跟随数量继续累 (允许双向尝试)
        /* 故保留 newAcc, 仅排空残余 (UX-V7 §6.2: 跟手期反向可退) */
      }
      /* 重新排 120ms 空闲 = 唯一计时 (跟手期不 rAF 缓动, 单一 timeout 防并发) */
      clearWheelIdle();
      wheelIdleTimer = setTimeout(wheelCommitOrRebound, IDLE_DECAY_WAIT);
      return;
    }
    /* IDLE: 首事件 = wheelClaim 进入 TRACKING (reduce 下不走 TRACKING, 直接 instantSwap) */
    if (e.ctrlKey || e.metaKey || e.altKey) return;            // 修饰键放行
    var d0 = e.deltaY;
    if (!d0) return;
    if (Math.abs(e.deltaX) > Math.abs(d0)) return;             // 横向手势整体忽略
    var d = d0 > 0 ? 1 : -1;
    if (C.innerScrollYields(d, e.target)) return;              // 内滚让位
    e.preventDefault();
    if (e.deltaMode === 2){                                     // 页模式: 直接 commit (走 IDLE 直路)
      var target0 = d > 0 ? C.nextName() : C.prevName();
      if (C.reduceMQ.matches){ C.instantSwap(target0); startWheelCooldown(350); return; }
      if (history.pushState) history.pushState(null, '', '#' + target0);
      C.snapTo(d, 1);
      startWheelCooldown(C.SNAP_DURATION + 40 + 50);          // R3.1 修复 #1: 同 commit 路径 (ARCH-V8 §5.1)
      return;
    }
    /* reduce 模式: 不走 TRACKING 跟手, 直接 instantSwap + 350ms 冷却门 */
    if (C.reduceMQ.matches){
      var targetR = d > 0 ? C.nextName() : C.prevName();
      C.instantSwap(targetR);
      startWheelCooldown(350);
      return;
    }
    /* 首事件: 进 TRACKING 跟手 */
    wheelClaim(d);
    var inc0 = (e.deltaMode === 1 ? d0 * WHEEL_LINE : d0);
    var acc0 = inc0;
    if (acc0 > C.WHEEL_THRESHOLD) acc0 = C.WHEEL_THRESHOLD;
    if (acc0 < -C.WHEEL_THRESHOLD) acc0 = -C.WHEEL_THRESHOLD;
    C.setAccum(acc0);
    clearWheelIdle();
    wheelIdleTimer = setTimeout(wheelCommitOrRebound, IDLE_DECAY_WAIT);
  }, { passive: false });

  /* ---------- 输入源 ②: 触摸拖拽同管线 (§3.1/§5) ---------- */
  var touch = null;   // {x0,y0,active,claimed,samples:[{y,t}]}
  function trackFrame(){
    if (!touch || !touch.claimed || C.getState() !== 'TRACKING'){ C.setRaf(null); return; }
    var el = document.getElementById(C.SCREENS[C.getCurrent()]);
    el.classList.add('sliding');
    var p = Math.max(-1, Math.min(1, C.getAccum() / C.WHEEL_THRESHOLD));  // 跟手 1:1: 位移 = -p·H, 零过渡
    el.style.setProperty('--shift', String(-p));
    // V5.3 P1: 预挂目标屏同步跟手, offset = (dir−p)·H → p=0 贴对侧, p=±1 恰好对齐, 全程无缝无虚空
    var pm = C.getPreMount && C.getPreMount();
    if (pm){
      pm.el.classList.add('sliding');
      pm.el.style.setProperty('--shift', String(pm.dir - p));
    }
    C.setRaf(requestAnimationFrame(trackFrame));
  }
  window.addEventListener('touchstart', function(e){
    /* V11 CR-1 (UX-V11 §2.4/§2.6 双保险; AC-C06): 灯箱 open 期间不接管触摸手势 —
       若放行 touchstart 进入 TRACKING, 手势链可不经过 .lb, touchend 直调
       instantSwap/snapTo 绕过 goTo() 守卫; 源头不建 touch 状态最干净 */
    if (window.SAS_V11 && window.SAS_V11.lightbox && window.SAS_V11.lightbox.isOpen()) return;
    if (C.getState() !== 'IDLE' || e.touches.length !== 1) return;
    touch = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, active: true, claimed: false,
              samples: [{ y: e.touches[0].clientY, t: performance.now() }] };
  }, { passive: true });
  window.addEventListener('touchmove', function(e){
    if (!touch || !touch.active) return;
    var t0 = e.touches[0];
    var dy = t0.clientY - touch.y0, dx = t0.clientX - touch.x0;
    if (!touch.claimed){
      if (Math.abs(dy) < DRAG_SLOP && Math.abs(dx) < DRAG_SLOP) return;   // slop 门: 保住 tap/长按
      if (Math.abs(dx) > Math.abs(dy)){ touch.active = false; return; }     // 横向手势整体放弃
      var d = dy < 0 ? 1 : -1;                                            // 手指上扫 = 下一页
      if (C.innerScrollYields(d, e.target)){ touch.active = false; return; }// 内滚让位 (§5)
      touch.claimed = true;
      if (e.cancelable) e.preventDefault();
      C.setAccum(0);
      // 状态切入 TRACKING: 引擎 goTo 在 TRACKING 期拒绝外部跳转, 此处经 API 置位
      C.setState('TRACKING');
      if (!C.getRaf()) C.setRaf(requestAnimationFrame(trackFrame));
    }
    if (e.cancelable) e.preventDefault();
    C.setAccum(-dy);
    // V5.3 P1: p 首离 0 即预挂载目标屏到对侧, 跟手全程无虚空 (反向拖拽自动换挂)
    if (-dy !== 0) C.preMountTarget(-dy > 0 ? 1 : -1);
    touch.samples.push({ y: t0.clientY, t: performance.now() });
    if (touch.samples.length > 12) touch.samples.shift();
  }, { passive: false });
  window.addEventListener('touchend', function(e){
    /* V11 CR-1 (双保险第二道): 灯箱 open 时丢弃手势, 不得走到下方 instantSwap/snapTo 直调 */
    if (window.SAS_V11 && window.SAS_V11.lightbox && window.SAS_V11.lightbox.isOpen()){ touch = null; return; }
    if (!touch || !touch.active || !touch.claimed){ touch = null; return; }
    if (C.getState() !== 'TRACKING'){ touch = null; return; }
    if (C.getRaf()){ cancelAnimationFrame(C.getRaf()); C.setRaf(null); }
    var now = performance.now(), s = touch.samples;
    var ref = null;                                            // 末 80ms 窗口均值速度 (§3.2)
    for (var i = s.length - 1; i >= 0; i--){ if (now - s[i].t > VEL_WINDOW) { ref = s[i]; break; } }
    if (!ref) ref = s[0];
    var vel = Math.abs(s[s.length-1].y - ref.y) / Math.max(now - ref.t, 1);
    var acc = C.getAccum();
    var dir = acc > 0 ? 1 : -1;
    var p = Math.max(-1, Math.min(1, acc / C.WHEEL_THRESHOLD));
    touch = null;
    if (Math.abs(acc) >= DRAG_COMMIT_DIST || vel >= DRAG_COMMIT_VEL){
      if (C.reduceMQ.matches){                                   // reduce: 不跟手, 过阈值瞬时换页
        var el0 = document.getElementById(C.SCREENS[C.getCurrent()]);
        el0.classList.remove('sliding');
        el0.style.removeProperty('--shift');
        C.instantSwap(dir > 0 ? C.nextName() : C.prevName());
        return;
      }
      C.snapTo(dir, p);                                          // 中途 commit: 剩余比例时长, 衔接连贯
      if (history.pushState) history.pushState(null, '', '#' + (dir > 0 ? C.nextName() : C.prevName()));  // commit 时刻压栈 (§8)
    } else {
      C.rebound(p);
    }
  });
  window.addEventListener('touchcancel', function(){
    if (touch && touch.claimed && C.getState() === 'TRACKING'){
      if (C.getRaf()){ cancelAnimationFrame(C.getRaf()); C.setRaf(null); }
      C.rebound(Math.max(-1, Math.min(1, C.getAccum() / C.WHEEL_THRESHOLD)));  // 多指/取消: 立即回弹不 commit
    }
    touch = null;
  });

  /* ---------- 输入源 ③: 键盘 (§5b) ---------- */
  document.addEventListener('keydown', function(e){
    if (e.ctrlKey || e.metaKey || e.altKey) return;            // 修饰键放行 (REVIEW-V5 建议-1)
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
    var key = e.key;
    if (key === 'Home'){ e.preventDefault(); C.goTo('platform'); return; }   // Home/End=导航语义, 不受内滚限
    if (key === 'End'){ e.preventDefault(); C.goTo(C.ORDER[C.ORDER.length - 1]); return; }   // V8 R2.2.3: End → 末屏 (contact), ORDER 驱动
    var dir = (key === 'ArrowDown' || key === 'PageDown') ? 1 : (key === 'ArrowUp' || key === 'PageUp') ? -1 : 0;
    if (!dir) return;
    if (C.getState() === 'IDLE' && C.innerScrollYields(dir, ae || document.body)) return;  // 屏内原生滚动优先
    e.preventDefault();
    if (C.getState() === 'WHEELING'){ C.pending(dir); return; }  // 锁定期只记 pending (§1)
    if (C.getState() === 'TRACKING') return;
    if (C.reduceMQ.matches){ C.instantSwap(dir > 0 ? C.nextName() : C.prevName()); return; }
    if (history.pushState) history.pushState(null, '', '#' + (dir > 0 ? C.nextName() : C.prevName()));
    C.snapTo(dir, 1);
  });
})();
