/* ===== 星空氛围层引擎 M3+V5.1 (UX-POLISH-V5.1 §2): 三层亮度分层 / glow 晕 / 双层视差 =====
   生命周期纪律不变: hidden 即停 / 恢复保留相位 / 主题切换 200ms 插值重着色 / reduce 单帧定格(含glow)
   取色唯一入口: getComputedStyle 读 --star-1/--star-2/--star-glow-1 (非裸色纪律)
   V5.1 三层 (§2.1): A尘星60%(远,慢x0.45,峰α亮.10/暗.14)
                     B中星30%(中,x1.0,峰α亮.20/暗.22)
                     C亮星10%(近,快x1.3,核α亮.24/暗.22 + glow晕5x半径, 峰差≥0.10)
   glow 性能纪律 (§2.2): 径向渐变按色缓存模板(单位半径), 绘制时 scale 复用, 禁 shadowBlur/每帧 new
   指针视差 (§2.3): pointermove(passive) 记归一化值, 每帧 lerp k=0.06, 层偏移 A±3/B±6/C±12px */
(function(){
  var canvas = document.getElementById('starfield');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineMQ = window.matchMedia('(pointer: fine)');   // 触屏无指针设备: 视差监听不挂
  var W = 0, H = 0, DPR = 1;
  var parts = [];                                  // 粒子: {x,y,r,vx,vy,base,peak,halo,phase,period,warm,tier}
  var raf = null, t0 = 0;
  var MAX_PARTICLES = 120;                         // 硬上限 (REQ-V5 S3) 不变

  /* 双档色缓存: 主题切换插值用 (UX-V5 §2.5) */
  function readColors(){
    var cs = getComputedStyle(document.documentElement);
    function rgb(name, fb){
      var v = (cs.getPropertyValue(name) || '').trim();
      var m = v.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : fb;
    }
    return { c1: rgb('--star-1', [110,122,150]), c2: rgb('--star-2', [180,83,9]),
             glow: rgb('--star-glow-1', [110,122,150]),
             glow2: rgb('--star-glow-2', [110,122,150]) };   // V5.4 明星双层晕色 (slate, AA 实算安全档)
  }
  var colA = readColors();                         // colA=当前档色 (插值结束后同步为目标档)
  var isDark = function(){ return document.documentElement.getAttribute('data-theme') === 'dark'; };

  /* 三层参数双档 (§2.1 表): base = peak×0.25; haloPeak = 晕峰值α
     V5.4 璀璨强化 (TEST-V5.3: 亮层占比仅15% '稀疏平淡'):
     ① C 亮层占比 .15→.28 (~30颗) ② 新增 S 明星层 ~6-8颗: 核α.80 + 双层晕(5x α.45 / 9x α.18, slate 晕色 AA 实算档)
     ③ B 中层峰 α .22→.26 (卡 .15~.28 区间) ④ 密度公式除数 12500→8000: 1280×720→115 / 1440×900→120 (钳硬上限)
     亮档 α 保持保守 (V5.3 D1 口径: 亮=投影塑形, 纸面正文 AA 余量) */
  function tier(){
    return isDark()
      ? { mix:0.75, haloPeak:0.35,
          A:{p:.20, rMin:0.5, rMax:1.0, spd:0.45, peak:0.14},
          B:{p:.46, rMin:1.0, rMax:1.6, spd:1.00, peak:0.26},
          C:{p:.28, rMin:2.0, rMax:2.6, spd:1.30, peak:0.62},
          S:{p:.06, rMin:2.2, rMax:2.8, spd:1.45, peak:0.80, h1:0.45, h2:0.18} }
      : { mix:0.80, haloPeak:0.10,
          A:{p:.20, rMin:0.5, rMax:1.0, spd:0.45, peak:0.10},
          B:{p:.46, rMin:1.0, rMax:1.6, spd:1.00, peak:0.20},
          C:{p:.28, rMin:2.0, rMax:2.6, spd:1.30, peak:0.24},
          S:{p:.06, rMin:2.2, rMax:2.8, spd:1.45, peak:0.30, h1:0.12, h2:0.05} };
  }
  /* 粒子数: 面积自适应 clamp(48, w*h/8000, 120) → 1280×720 实配 115 / 1440×900 钳 120 (V5.4) */
  function particleCount(){
    return Math.max(48, Math.min(MAX_PARTICLES, Math.floor(W * H / 8000)));
  }
  function rand(a,b){ return a + Math.random() * (b - a); }

  function build(){
    var T = tier();
    var n = particleCount();
    parts = [];
    for (var i=0;i<n;i++){
      var u = Math.random();
      var L = u < T.A.p ? T.A : (u < T.A.p + T.B.p ? T.B : (u < T.A.p + T.B.p + T.C.p ? T.C : T.S));   // 20/46/28/6 分层 (V5.4)
      var warm = Math.random() > T.mix;            // 20~25% 点缀星 (配比不变)
      // 漂移方向 −75° (近上偏右 15°), 速度 6~12px/s × 层速差 (第一重视差, 零成本)
      var ang = (-75 + rand(-6, 6)) * Math.PI / 180;
      var spd = rand(6, 12) * L.spd;
      // C/S 亮层全屏分布 (TEST-V5.2: 左半必有亮星): 左右半屏交替落位+半内随机, 确定性保证左半≥1颗
      var x = (L === T.C || L === T.S)
        ? (i % 2 === 0 ? rand(0, W * 0.5) : rand(W * 0.5, W))
        : rand(0, W);
      parts.push({
        x: x, y: rand(0, H),
        r: rand(L.rMin, L.rMax),
        vx: Math.sin(ang) * spd, vy: -Math.cos(ang) * spd,
        base: L.peak * 0.25,                      // 呼吸谷底 = 峰值×0.25, 层级越近呼吸越大
        peak: L.peak,
        halo: (L === T.C) ? T.haloPeak : 0,       // C 层单晕
        h1: (L === T.S) ? L.h1 : 0,              // S 明星层: 5x 内晕 α
        h2: (L === T.S) ? L.h2 : 0,              // S 明星层: 9x 外晕 α
        warm: warm,
        tier: (L === T.A) ? 0 : (L === T.B ? 1 : 2),
        phase: rand(0, Math.PI * 2),
        period: rand(3, 9)                        // twinkle 周期 3~9s 随机
      });
    }
  }

  /* glow 渐变模板缓存 (§2.2): 单位半径径向渐变按 "r,g,b" 键复用, 绘制时 translate+scale;
     稳态仅 1~2 个键 (重着色过渡期短暂多几个, 上限 16 防泄漏), 禁每帧 createRadialGradient */
  var glowCache = {};
  function glowGrad(c){
    var key = c[0] + ',' + c[1] + ',' + c[2];
    var g = glowCache[key];
    if (!g){
      if (Object.keys(glowCache).length > 16) glowCache = {};
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(' + key + ',1)');   // 内 stop = 星色实, 外 stop 透明
      g.addColorStop(1, 'rgba(' + key + ',0)');
      glowCache[key] = g;
    }
    return g;
  }
  /* 画一颗星: 核 = 实心 arc; C 层先画单晕 (5×核); S 明星层画双层晕
     (内晕 5×核 α.h1 用星核同色, 外晕 9×核 α.h2 用 --star-glow-2 slate 扩散色), 均与核同相位呼吸 */
  function drawHalo(x, y, scale, a, cGlow){
    if (a <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(a, 1);
    ctx.fillStyle = glowGrad(cGlow);
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  function drawStar(p, a, cCore, cGlow, cGlow2, ox, oy){
    var x = p.x + ox, y = p.y + oy;
    if (p.h2 > 0){                                // S 明星: 外晕 9x (slate 扩散, 同相位)
      drawHalo(x, y, p.r * 9, a * (p.h2 / p.peak), cGlow2);
      drawHalo(x, y, p.r * 5, a * (p.h1 / p.peak), cCore);   // 内晕 5x 随核色
    } else if (p.halo > 0){                       // C 层: 单晕 5x (α 与核同相位, §2.2)
      drawHalo(x, y, p.r * 5, a * (p.halo / p.peak), cGlow);
    }
    ctx.fillStyle = 'rgba(' + cCore[0] + ',' + cCore[1] + ',' + cCore[2] + ',' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 指针视差状态 (§2.3): 只记值零 DOM 写; lerp 在 draw 循环内完成 */
  var ptr = { tx:0, ty:0, x:0, y:0 };
  var LAYER_OFF = [3, 6, 12];                    // A/B/C 层最大偏移 px (上限纪律: <壳条高)
  function onPointerMove(e){
    ptr.tx = (e.clientX / W) * 2 - 1;
    ptr.ty = (e.clientY / H) * 2 - 1;
  }
  var parallaxOn = false;
  function syncParallax(){
    var want = fineMQ.matches && !reduceMQ.matches;
    if (want === parallaxOn) return;
    if (want) window.addEventListener('pointermove', onPointerMove, { passive: true });
    else { window.removeEventListener('pointermove', onPointerMove); ptr.x = ptr.y = ptr.tx = ptr.ty = 0; }
    parallaxOn = want;
  }

  function draw(tSec, dt){
    ctx.clearRect(0, 0, W, H);
    // 主题插值: recoloring 时按时间线性 colFrom→colTo (含 glow 晕色, 同一管线 §2.5)
    var c1, c2, cg, cg2;
    if (recoloring){
      var k = recolorK();
      c1 = mixRGB(recolorFrom.c1, recolorTo.c1, k);
      c2 = mixRGB(recolorFrom.c2, recolorTo.c2, k);
      cg = mixRGB(recolorFrom.glow, recolorTo.glow, k);
      cg2 = mixRGB(recolorFrom.glow2, recolorTo.glow2, k);
    } else { c1 = colA.c1; c2 = colA.c2; cg = colA.glow; cg2 = colA.glow2; }
    // 指针 lerp k=0.06 指数趋近 (无抖动)
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    for (var i=0;i<parts.length;i++){
      var p = parts[i];
      if (!reduceMQ.matches){
        // 漂移 + 环绕 (wrap 出屏回绕, 无爆散); dt 帧间隔驱动 (REVIEW-V5 建议-2)
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -2) p.x = W + 2; else if (p.x > W + 2) p.x = -2;
        if (p.y < -2) p.y = H + 2; else if (p.y > H + 2) p.y = -2;
      }
      // twinkle: base↔peak sin 呼吸
      var a = p.base + (p.peak - p.base) * (0.5 + 0.5 * Math.sin(tSec * (2 * Math.PI / p.period) + p.phase));
      var off = LAYER_OFF[p.tier];
      drawStar(p, a, p.warm ? c2 : c1, cg, cg2, ptr.x * off, ptr.y * off);
    }
  }

  /* 重着色插值状态 (sas:themechange 驱动, 与全局 .theme-anim 同长 200ms):
     recoloring=true 期间 draw() 按时间线性插值 colFrom→colTo; 结束回单档 */
  var recoloring = false, recolorFrom = null, recolorTo = null, recolorT0 = 0;
  function mixRGB(a, b, k){ return [Math.round(a[0]+(b[0]-a[0])*k), Math.round(a[1]+(b[1]-a[1])*k), Math.round(a[2]+(b[2]-a[2])*k)]; }
  function recolorK(){
    if (!recoloring) return 1;
    var k = (performance.now() - recolorT0) / 200;
    if (k >= 1){ recoloring = false; colA = recolorTo; return 1; }
    return k;
  }
  document.addEventListener('sas:themechange', function(){
    var target = readColors();
    if (reduceMQ.matches){ colA = target; recoloring = false; drawFrame(); return; }  // reduce: 瞬时换档
    // 以当前显示色 (可能处于上一段插值中) 为起点, 200ms 线性过渡到目标档
    var k = recolorK();
    var from = recoloring ? { c1: mixRGB(recolorFrom.c1, recolorTo.c1, k), c2: mixRGB(recolorFrom.c2, recolorTo.c2, k), glow: mixRGB(recolorFrom.glow, recolorTo.glow, k), glow2: mixRGB(recolorFrom.glow2, recolorTo.glow2, k) } : colA;
    recolorFrom = from; recolorTo = target; recolorT0 = performance.now(); recoloring = true;
    start();                                       // 插值期间 rAF 正常走帧
  });

  /* 单帧定格 (reduce / 首帧): 三层分布保留, alpha 取 base~peak 中值, glow 晕照常绘制 (§8) */
  function drawFrame(){
    var c = readColors();
    ctx.clearRect(0, 0, W, H);
    for (var i=0;i<parts.length;i++){
      var p = parts[i];
      var a = (p.base + p.peak) / 2;              // 呼吸中值: 三层亮度差可见 (多峰结构保留)
      drawStar(p, a, p.warm ? c.c2 : c.c1, c.glow, c.glow2, 0, 0);   // 定格帧零视差偏移 (含明星双层晕)
    }
  }

  var lastNow = 0;                                // 上一帧时刻, dt 帧间隔驱动用
  function loop(now){
    if (document.hidden){ raf = null; return; }    // hidden 即停 (S3)
    if (reduceMQ.matches){ raf = null; drawFrame(); return; }
    var t = (now - t0) / 1000;
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 1/60;  // 钳 50ms 防切回后台大跳
    lastNow = now;
    draw(t, dt);
    raf = requestAnimationFrame(loop);
  }
  function start(){
    if (raf || reduceMQ.matches) return;
    if (!t0) t0 = performance.now();              // 恢复保留相位, 星点不跳位
    raf = requestAnimationFrame(loop);
  }
  function stop(){ if (raf){ cancelAnimationFrame(raf); raf = null; } }

  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
    if (reduceMQ.matches) drawFrame();
  }
  var rTimer = null;
  window.addEventListener('resize', function(){
    clearTimeout(rTimer);
    rTimer = setTimeout(resize, 200);             // resize 防抖 200ms 重铺
  });
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) stop(); else start();     // 回前台重启 (相位连续)
  });
  function onReduceChange(){
    syncParallax();                                // reduce 开启→视差监听摘除
    if (reduceMQ.matches){ stop(); drawFrame(); }  // 开启→定格
    else start();                                 // 关闭→重启
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);
  if (fineMQ.addEventListener) fineMQ.addEventListener('change', syncParallax);

  resize();
  syncParallax();
  if (reduceMQ.matches) drawFrame(); else start();
})();
