# CialloSpeed

免费在线网速测试站 · <https://speed.ciallo.de/>（英文主站）· <https://speed.ciallo.de/zh/>（中文）

七大测速引擎交叉验证，纯静态、零后端、零带宽成本，测速结果只保存在访问者浏览器本地。

| 引擎 | 方式 | 测什么 |
| --- | --- | --- |
| Cloudflare | `@cloudflare/speedtest` SDK，全球边缘节点 | 下载 / 上传 / 延迟 / 抖动 |
| M-Lab NDT7 | WebSocket 直连 M-Lab 节点（学术级单 TCP） | 下载 / 上传 / 延迟 / 负载延迟 |
| OpenSpeedTest | 跨域 iframe 挂件 | 挂件内自测 |
| Meter.net | 跨域 iframe 挂件 | 挂件内自测 |
| SpeedMeter.dev | 跨域 iframe 挂件（postMessage 回传结果） | 下载 / 上传 / 延迟 |
| LibreSpeed | 自实现客户端，社区公共节点 | 下载 / 上传 / 延迟 |
| CDN 直链 | 时间盒连续下载大厂 CDN 固定文件 | 仅下载（到各 CDN 的真实质量） |

## 开发

```bash
npm install
npm run dev          # http://localhost:5173，根路径=英文，/zh/=中文
npm run build        # check:i18n → tsc --noEmit → vite build
npm run preview
npm test             # vitest，纯函数单测（node 环境 + 最小 DOM 桩）
npm run lint         # eslint 扁平配置
npm run check:i18n   # 词典覆盖率校验
npm run probe        # 第三方测速目标失效探测（CI 每天跑一次）
```

要求 Node ≥ 20（构建脚本用到 `AbortSignal.timeout`、`fs.readdirSync(recursive)`）。

## 架构要点

**多页 + 构建期 i18n。** 中文源 HTML 是唯一来源，`build/i18n-plugin.ts` 在构建期派生两个变体：
根路径的英文页（套用 `locales/en/<page>.json`）与 `/zh/` 中文页（内链、canonical、og:url 加 `/zh` 前缀）。
标注约定：`data-i18n` / `data-i18n-html` / `data-i18n-attrs="content:key"` / `data-i18n-jsonld`。
插件对缺失的键**静默跳过**，所以英文页漏翻不会报错——由 `scripts/check-i18n.mjs` 在 `npm run build` 前置卡住。

**两套词典分工。** 页面静态文案在 `locales/en/*.json`（构建期）；测速过程中的动态文案（阶段名、按钮、
场景评分、错误提示）在 `src/i18n/strings/{zh-CN,en}.ts`（运行时，`t(key, params)` 插值，
TS 的 `Record<StringKey, string>` 保证英文键集与中文一一对应）。

**引擎懒加载。** `src/pages/home.ts` 只在用户首次切到某个引擎面板时 `import()` 对应模块，
首屏不背 Cloudflare SDK 与 NDT7 客户端；加载失败不记入已加载集合，再切回来会重试。

**全局测速锁。** `src/modules/test-state.ts` 保证同一时刻只有一个引擎占用链路（并发测速会让两边读数都失真）。
NDT7 的 worker 无法真正取消，界面停止后仍会收尾，用 `markStopping` 继续占锁直到 Promise 落定；
切换面板时 `stopActive()` 作废正在进行的轮次。

**第三方目标是易腐数据。** CDN 直链、LibreSpeed 公共节点、挂件地址统一维护在 `config/speed-targets.json`，
浏览器代码与探测脚本共用同一来源；`lastVerified` 记录最近一次实测通过的日期。
`.github/workflows/probe-speed-targets.yml` 每天按浏览器真实条件（带 `Origin` 头）复现一次请求，失效即标红。

**零后端。** 历史、引擎偏好、主题、语言、CDN 勾选、LibreSpeed 节点偏好全部在 localStorage：
`ciallospeed-history` / `-engine` / `-theme` / `-locale` / `-cdn-targets` / `-ls-node` / `-ipinfo`。

## 目录

```
index.html  guide.html  wifi-tips.html  how-it-works.html  why-different.html  faq.html  404.html
build/i18n-plugin.ts      构建期派生英文主站与 /zh/ 变体
config/speed-targets.json 第三方测速目标唯一来源
locales/en/*.json         页面静态文案英文词典
public/                   原样拷贝的静态资源（含 NDT7 worker、_headers、_redirects）
src/i18n/                 运行时文案字典
src/modules/              测速引擎、历史、质量评分、互斥锁等浏览器侧逻辑
src/pages/                各页入口（home 负责引擎懒加载与面板切换）
src/styles/               tokens → base → components → pages
tests/                    vitest 单测
scripts/                  失效探测、i18n 校验、favicon / OG 图生成
```

## 部署

Netlify 静态托管 `dist/`：

- `public/_redirects`：旧 `/en/*` 301 到根路径。
- `public/_headers`：CSP 与安全响应头、`/assets/*` 永久缓存。

**CSP 约束：`script-src` 不含 `unsafe-inline`。** 首屏主题预置与语言协商脚本因此是独立文件
（`public/theme-init.js`、`public/locale-init.js`），HTML 里也不要写 `onclick="..."` 之类的内联事件——
会被 CSP 拦掉且没有任何提示。`connect-src` 放宽到 `https: wss:`，因为 CDN 直链引擎允许访问者粘贴任意
https 文件直链。

## 常见维护动作

- **增删测速目标**：只改 `config/speed-targets.json`，然后 `npm run probe` 验证，并更新 `lastVerified`。
- **新增页面**：写中文源 HTML → 在 `vite.config.ts` 的 `rollupOptions.input` 注册 → 在
  `build/i18n-plugin.ts` 的 `PAGES` 补页名 → 建 `locales/en/<page>.json` → 更新 `public/sitemap.xml`。
- **新增引擎**：在 `src/modules/` 写面板模块（记得 `testState.acquire/release/register`）→
  在 `home.ts` 的 `loaders` 注册 → 在 `index.html` 的引擎菜单加选项 → 在 `src/modules/history.ts`
  的 `EngineId` / `ENGINE_LABEL` 补 id 与两侧文案键。
- **换品牌图**：源图放 `assets-src/`，跑 `python scripts/gen-favicons.py` 与 `scripts/gen-og-image.py`。
