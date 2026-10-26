# Simple-Dot Agent Studio · 官网站体 (V12)

零构建标准多文件静态站。部署 = 把本目录整个拷到任意静态服务器根，
或本地起静态服务预览；**无需任何构建步骤、无合并脚本**（V7 `merge.sh`
分片工艺已随 ARCH-V8 废除）。

## 目录结构

```
repo/
  index.html          # 主 HTML: 空壳 + 内联 boot (i18n/主题防闪烁) + 4 屏 DOM
  faq.html            # V12: FAQ 独立静态页 (issue #10, 手风琴 + 深链 + 无 JS 降级)
  manual.html         # V12: 使用手册独立静态页 (issue #11, 双栏 sticky TOC + 复制钮)
  assets/
    favicon.svg                 # 站点图标 (原 head data URI 外联化)
    contact-wecom-qr.jpeg       # contact 屏二维码 (真实素材)
    sc-traceable.webp           # 屏 2 S3「全程可追踪」真实配图 (V10)
    sc-oss-pixel-agents.webp    # 屏 2 S4 图组 1/2: pixel-agents (V10)
    sc-oss-hermes-webui.webp    # 屏 2 S4 图组 2/2: hermes-webui (V10)
    sc-overnight.webp           # 屏 2 配图 (V11)
    sc-pipeline-1.webp          # 屏 2 配图 (V11)
    sc-pipeline-2.webp          # 屏 2 配图 (V11)
  styles/             # 7 个 CSS, <link> 顺序 = 加载序纪律 (tokens 必须最先)
    tokens.css        # :root 设计 token (色/字/间距/动效, 亮暗双档)
    shell.css         # header / 移动菜单 / footer / skip-link / 星空容器
    screen.css        # 屏级骨架 + contact 屏 (.ct-*) + 残影全局 pointer-events
    screen-v7.css     # 屏 2 卡局部 + 换牌动效 + 375 回退 + V10 图组控件段
    cardstack.css     # 屏 1 卡堆 + 翻牌 + slam
    motion.css        # 屏内过渡 + reduced-motion 兜底
    pages.css         # V12: faq.html / manual.html 专属片 (手风琴/TOC/命令块)
  scripts/            # 12 个 JS, <script defer> 文档序 = 执行序纪律
    i18n.js           # window.SAS_I18N.zh (字典)
    i18n-en.js        # window.SAS_I18N.en (增量)
    carousel.js       # 引擎: 状态机 + 屏切换 + hash 路由 (window.SAS_CAROUSEL)
    inputs.js         # 输入源: wheel / touch / keyboard
    shell.js          # 壳片: i18n 应用 / 导航点击 / 卡堆 / 复制 / 主题 / boot
    screen-v7.js      # 屏 2 专属: assignSlots + rail 高亮条 (window.SAS_V7)
    screen-v10.js     # 屏 2 专属: 图组切换 (window.SAS_V10.shotPager) (V10)
    screen-v11.js     # 屏 2 专属: 灯箱「点击查看原图」(V11)
    pages.js          # V12: 两新页专属: 手风琴/深链/TOC/复制钮 (window.SAS_PAGES)
    starfield.js      # 星空 canvas
    logo.js           # LOGO ticker
```

## 部署

任意静态服务器指向本目录即可（同源本地文件，零外部资源请求；
外链 `<a>` 仅 README/GitHub 等导航, 不计资源）。Nginx / Caddy /
`python3 -m http.server` 均可：

```sh
cd repo && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080  (FAQ: /faq.html, 手册: /manual.html)
```

## 加载时序纪律（勿改）

1. `styles/tokens.css` 必须第一个 `<link>`（`:root` 变量先于一切消费者）。
2. 两段 boot（i18n / theme）**必须保持内联**于 `<head>`：防首帧闪烁的
   同步机制，外联脚本在 HTML 解析后才执行会闪一帧。
3. JS 全部 `defer`，文档序 = 执行序：`i18n → i18n-en → carousel → inputs
   → shell → screen-v7 → screen-v10 → screen-v11 → starfield → logo`。screen-v7 在 shell
   之后加载是设计使然（shell 的 setSubState 经 lazy getter 在调用时拉取
   SAS_V7）；screen-v10 紧随 screen-v7（屏 2 图组切换，依赖 V7 槽位状态机）；
   screen-v11 紧随 screen-v10（V11 灯箱「点击查看原图」，依赖 V10 图组与 onerror 打标）。
4. V12 两新页（faq.html / manual.html）只引 `tokens.css + shell.css + pages.css`
   与 `pages.js`（i18n 双字典 + 内联 boot 同主站），index 专属片不引。

## 占位资产替换点

| 资产/常量 | 位置 | 替换语义 |
|---|---|---|
| 邮箱地址 | `index.html` 屏 4 `<a class="ct-mail" href="mailto:...">` | 改 href 一处即可；可见文本由 JS 从 href 注水 |
| 企业微信二维码 | `assets/contact-wecom-qr.jpeg` | 替换此文件，src 指向正确后缀 |
| 屏 2 配图 | `assets/sc-*.webp` | 同名覆盖即替换，尺寸按 2.2× 显示宽导出 |

详见仓库 `docs/implementation-notes.md`（非部署产物）与 `docs/implementation-notes-v10.md`（V10 屏 2 增量）。
