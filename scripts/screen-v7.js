/* ===== V7 屏2 换牌动效 + sc-rail 选择器接线片 (12d-app-v7.js):
       12c-app.js 已持有 V6 全部逻辑; 本片独立挂接 V7 屏2 专属行为:
       - assignSlots(cards, active): 槽位轮换 = 仅改 .slot-* class
       - positionSubIndV7(rail, k): 高亮条 --rail-y 滑动
       - subBtnForScreen(screen): 屏2 = .sc-rail, 屏3 = .subnav (回退)
       通过 window.SAS_V7 命名空间导出函数; 12c 在屏2调用时优先用本片实现.
       defer 序文档载入, shell.js 在调用时通过 lazy getter 取 SAS_V7 实现, 全局命名空间不冲突. */
(function(){
  if (window.SAS_V7) return;            // 防重复挂载
  /* V7 槽位分配 (V10 扩为四槽): 卡 i 槽位 = (i - active + N) % N, N=卡数 (3→V7 原行为零变化,
     4→V10: slot-a 顶卡 / b/c 残影 / d 待浮现层). 仅改 class, 几何/transition 由 CSS 接管 */
  function assignSlots(cards, active){
    var n = cards.length;
    var slots = ['a','b','c','d'];
    for (var i=0;i<n;i++){
      var slot = (i - active + n) % n;
      cards[i].classList.remove('slot-a','slot-b','slot-c','slot-d');
      cards[i].classList.add('slot-' + slots[slot]);
      /* R3.4 修复 #5: 仅残影写 aria-hidden=true, 顶卡 removeAttribute (ARCH-V8 §5.4b) */
      if (slot === 0) cards[i].removeAttribute('aria-hidden');
      else cards[i].setAttribute('aria-hidden', 'true');
    }
  }
  /* V7 rail 高亮条定位 (滑入跟手) */
  function positionSubIndV7(rail, k){
    var ind = rail.querySelector('.rail-ind');
    var btn = rail.querySelector('button[data-sub="' + k + '"]');
    if (!ind || !btn) return;
    if (window.matchMedia('(max-width:767px)').matches) return;     // 375 直跳, CSS 已隐藏高亮条
    ind.style.setProperty('--rail-y', btn.offsetTop + 'px');
  }
  window.SAS_V7 = { assignSlots: assignSlots, positionSubIndV7: positionSubIndV7 };
})();
