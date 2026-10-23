/* logo-mark 渲染器 — UX-DESIGN-V3 §5/§7: 单 rAF ticker 多实例, 时间驱动, 三层降级 */
(function(){
  var LogoMarks = { list: [], raf: null, t0: 0 };

  /* 几何唯一源 (§1.2): 系数 × S; 三点不对称 10:30/7:30/4:30, 禁均分 */
  var DOTS = [
    { r: 1.06, a0: 315, T: 16.0, dr: 0.062 },  // A 外圈小
    { r: 1.03, a0: 225, T: 15.3, dr: 0.055 },  // B 外圈更小
    { r: 0.55, a0: 135, T:  6.0, dr: 0.085 }   // C 环内中
  ];

  /* 画一帧: staticFrame=true 时三点钉在初始钟点位 (reduced-motion 静止帧) */
  function logoDraw(ctx, S, ringColor, dotColor, tSec, staticFrame) {
    var cx = 0.5 * S, cy = 0.5 * S, R = 0.34 * S;
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = ringColor; ctx.lineWidth = 0.085 * S;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = dotColor;
    for (var i = 0; i < 3; i++) {
      var d = DOTS[i];
      var a = staticFrame ? d.a0 : d.a0 + (tSec / d.T) * 360;
      var rad = a * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(cx + d.r * R * Math.sin(rad), cy - d.r * R * Math.cos(rad), d.dr * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 降级层2: canvas 不可用 → 同款静态 SVG 替换 (§7, 几何一致, 永不空白) */
  function logoFallback(canvas, S, variant) {
    var ring = variant === 'dark' ? '%238A93A0' : '%23343A40';
    var dot  = variant === 'dark' ? '%234DABF7' : '%231E90FF';
    var img = document.createElement('img');
    img.setAttribute('alt', ''); img.setAttribute('aria-hidden', 'true');
    img.width = S; img.height = S;
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='5.4' fill='none' stroke='" + ring + "' stroke-width='1.7'/%3E%3Ccircle cx='3.9' cy='3.9' r='1.35' fill='" + dot + "'/%3E%3Ccircle cx='4.0' cy='12.0' r='1.2' fill='" + dot + "'/%3E%3Ccircle cx='10.0' cy='10.0' r='1.8' fill='" + dot + "'/%3E%3C/svg%3E";
    canvas.parentNode.replaceChild(img, canvas);
  }

  /* 取色一次 (§5.3): canvas 不解析 var(), init 时从 :root 读实际值 */
  function logoColors(variant) {
    var cs = getComputedStyle(document.documentElement);
    function get(name, fb) { var v = cs.getPropertyValue(name).trim(); return v || fb; }
    return variant === 'dark'
      ? { ring: get('--brand-ring-dark', '#8A93A0'), dot: get('--brand-dot-dark', '#4DABF7') }
      : { ring: get('--brand-ring', '#343A40'), dot: get('--brand-dot', '#1878D8') };
  }

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  function logoTick(m, tSec, force) {
    if (reduceMQ.matches && !force) return;   // 降级层1: 静止帧已由首帧画出
    logoDraw(m.ctx, m.S, m.colors.ring, m.colors.dot, tSec, reduceMQ.matches);
  }

  function logoStart() {
    if (LogoMarks.raf) return;                            // 已有循环则不重复启动
    if (reduceMQ.matches) return;                        // S1: reduce 模式不启动 ticker (静止帧已由首帧画出)
    if (!LogoMarks.t0) LogoMarks.t0 = performance.now(); // R1: 只在首次设基准, 暂停恢复相位连续不跳变
    function loop(now) {
      var t = (now - LogoMarks.t0) / 1000;
      var any = false;
      for (var i = 0; i < LogoMarks.list.length; i++) {
        var m = LogoMarks.list[i];
        if (m.active && !document.hidden) { logoTick(m, t); any = true; }
      }
      LogoMarks.raf = any ? requestAnimationFrame(loop) : null;  // 全停则停循环
    }
    LogoMarks.raf = requestAnimationFrame(loop);
  }

  function initLogoMark(canvas) {
    var S = parseInt(canvas.getAttribute('data-size'), 10) || 32;
    var variant = canvas.getAttribute('data-logo') === 'dark' ? 'dark' : 'light';
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) {}
    if (!ctx) { logoFallback(canvas, S, variant); return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);   // DPR 封顶 2 (§4)
    canvas.width = S * dpr; canvas.height = S * dpr;
    canvas.style.width = S + 'px'; canvas.style.height = S + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var m = { canvas: canvas, ctx: ctx, S: S, variant: variant, active: true, colors: logoColors(variant) };
    LogoMarks.list.push(m);
    logoTick(m, 0, true);                                  // 首帧必画, 永不空白
    // 离屏暂停 (§5.2): 滚动离开视口即停绘制
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries){
        m.active = entries[0].isIntersecting;
        if (m.active) logoStart();
      });
      io.observe(canvas);
    }
    logoStart();
  }

  // reduced-motion 运行时切换 (§5.4): 开启→补画静止帧; 关闭→重启 ticker
  function onReduceChange() {
    if (reduceMQ.matches) {
      for (var i = 0; i < LogoMarks.list.length; i++)
        logoDraw(LogoMarks.list[i].ctx, LogoMarks.list[i].S, LogoMarks.list[i].colors.ring, LogoMarks.list[i].colors.dot, 0, true);
    } else {
      logoStart();
    }
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) logoStart();                     // 回前台重启
  });

  // v4 双主题联动 (UX-V4 §7): 主题切换时逐实例重取色并立即重绘当前帧,
  // 不重启 ticker、不动 t0, 相位连续
  document.addEventListener('sas:themechange', function () {
    var now = LogoMarks.t0 ? (performance.now() - LogoMarks.t0) / 1000 : 0;
    for (var i = 0; i < LogoMarks.list.length; i++) {
      var m = LogoMarks.list[i];
      m.colors = logoColors(m.variant);
      logoTick(m, now, true);
    }
  });

  var marks = document.querySelectorAll('canvas.logo-mark, canvas.hero-logo-mark');
  for (var k = 0; k < marks.length; k++) initLogoMark(marks[k]);
})();
