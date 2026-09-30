# CialloSpeed 全站中英双语化（构建时静态子目录方案）

## 方案总览

- **URL 形态**：根路径 = 中文，`/en/` 子目录 = 英文，镜像全部 7 个页面（`/en/`、`/en/guide.html` 等）。互配 hreflang，sitemap 加 alternate。
- **核心思路（构建时 i18n，零运行时开销）**：源 HTML（中文）保持唯一来源，可译节点打 `data-i18n` 标注键；自写一个 Vite 插件在构建时读取 `locales/en/*.json` 字典，为每页生成翻译后的英文变体（改写 `lang`、`og:locale`、canonical、内链前缀，注入 hreflang）。英文翻译不复制 HTML，改版面只需改一处。
- **语言协商**：首页内联轻量脚本，英文浏览器首次访问 `/` 时跳 `/en/`，localStorage 记忆；手动切换优先级最高。
- **选择理由**：这是 Google 官方推荐的多语言静态站结构，SEO 最优、无 JS 也能显示正确语言、无首帧闪烁。

## 文件改动

### 新增
| 文件 | 作用 |
|---|---|
| `build/i18n-plugin.ts` | Vite 插件：构建时为每个入口 HTML 生成 `/en/` 变体；dev 下用中间件同样支持 |
| `locales/en/shared.json` | 导航、页脚、主题按钮、跳转链接等 7 页共用文案的英文 |
| `locales/en/{index,guide,wifi-tips,how-it-works,why-different,faq,404}.json` | 各页正文、meta、JSON-LD 的英文翻译 |
| `src/i18n/index.ts` | 运行时 `t()`：按 `<html lang>`（构建期已定）选语言，支持 `{param}` 插值 |
| `src/i18n/strings/zh-CN.ts` + `en.ts` | TS 侧动态文案字典（类型安全，两语言都在 bundle 里，仅几 KB） |
| `src/modules/locale.ts` | 语言协商 + 切换按钮的偏好记忆 |

### 修改
- **7 个 HTML**：给可译节点加 `data-i18n="key"`（纯文本）、`data-i18n-html="key"`（含内联标签的长文）、`data-i18n-attrs="aria-label:key; content:key"`（meta/aria）、`data-i18n-jsonld="key"`（JSON-LD 整体替换）；导航加 `中/EN` 切换按钮（`data-lang-switch`）；首页 head 加协商内联脚本。
- **vite.config.ts**：`base: '/'`（让 en 子目录页正确引用 `/assets/` 资源）、挂载插件、新增 `node-html-parser` devDep 做构建期 DOM 解析。
- **`src/modules/cloudflare-engine.ts`**：`PHASE_TEXT`、场景评级、按钮/状态文案、错误模板 `测速出错：{message}…` → `t()` 调用。
- **`src/modules/history.ts`**：引擎名、质量评级词、清空确认文案 → `t()`；日期格式化改用 `Intl.DateTimeFormat`（en-US / zh-CN）。
- **`src/modules/theme.ts`**：切换按钮 aria/文本 → `t()`。
- **`public/sitemap.xml`**：每个 URL 加 `/en/` 对应项和 `xhtml:link rel="alternate"`。

## 插件转换规则（en 变体）

1. 按 `data-i18n*` 标注用英文词典替换文本/属性/JSON-LD
2. `<html lang>` → `en`，`og:locale` → `en_US`
3. 内链改写：`/guide.html` → `/en/guide.html`、`/` → `/en/`（仅站内页面链接，不动 `/favicon.svg`、锚点、外链）
4. canonical / og:url → `https://speed.ciallo.de/en/...`
5. 注入 hreflang 三连（`zh-CN`、`en`、`x-default` → 中文版）
6. `data-lang-switch` 链接填上当前页对应另一语言的 URL
7. zh 主版本同时获得 hreflang 注入与切换按钮链接（其余不动，中文文本保持内联，不需要中文词典）

## 实施顺序

1. 搭插件 + i18n 运行时骨架，用 404.html（最小页）打通端到端
2. 改造 3 个 TS 模块为 `t()` 调用（含类型定义与插值）
3. 逐页标注 HTML 并写英文翻译：index → guide → faq → how-it-works → why-different → wifi-tips → 404（长文页翻译量最大，放后面批量做）
4. 语言切换按钮 + 协商脚本 + sitemap
5. `npm run build` 验证：dist 结构、hreflang、en 页资源加载、切换往返、协商跳转不死循环

## 已知边界（不在本次范围但会说明）

- OpenSpeedTest iframe 与 Cloudflare SDK 内部 UI 是第三方内容，无法翻译
- 原生 `confirm()` 弹窗按钮语言受浏览器控制（文案本身会翻译）
- `/en/404.html` 能生成，但托管平台的自定义 404 规则指向哪份需部署时配置
- 导航/页脚在 7 个 HTML 里仍是重复标记（翻译走共享词典，不改结构，控制风险）

## 验证

构建后本地 preview，用浏览器实测中英两版：首页测速面板初始文案、结果评级 chips、历史记录、FAQ 手风琴、语言切换往返、hreflang 与 sitemap 正确性。
