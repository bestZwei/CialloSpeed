#!/usr/bin/env node
/**
 * 第三方测速目标失效探测。
 *
 * 本站三个引擎的可用性完全押在外部 URL 上（CDN 固定文件、LibreSpeed 公共节点、
 * 挂件页面），对方一旦改版、下线或关掉跨域，面板只会静默退化成"一排失败"。
 * 这个脚本按浏览器真实请求的条件（带 Origin 头）复现一次，用来把失效变成告警。
 *
 *   node scripts/probe-targets.mjs          # 人类可读输出
 *   node scripts/probe-targets.mjs --json   # 机器可读输出
 *
 * 任一目标失效即以退出码 1 结束（GitHub Actions 据此把任务标红并通知维护者）。
 */

import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 探测时冒充的站点来源：多数服务端只在请求带 Origin 时才回跨域头 */
const SITE_ORIGIN = 'https://speed.ciallo.de'
const TIMEOUT_MS = 20_000
const RANGE_BYTES = 256 * 1024

const CONFIG = fileURLToPath(new URL('../config/speed-targets.json', import.meta.url))

/** 取回响应并只读一小段，避免真的把大文件下完 */
async function probeFetch(url, { range = false } = {}) {
  const controller = AbortSignal.timeout(TIMEOUT_MS)
  const res = await fetch(url, {
    signal: controller,
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      Origin: SITE_ORIGIN,
      ...(range ? { Range: `bytes=0-${RANGE_BYTES - 1}` } : {}),
    },
  })
  let bytes = 0
  if (res.body) {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done || !value) break
      bytes += value.byteLength
      if (range && bytes >= RANGE_BYTES) {
        await reader.cancel().catch(() => {})
        break
      }
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel().catch(() => {})
        break
      }
    }
  }
  return { res, bytes }
}

/** CDN 直链：必须可读、且回跨域头，否则浏览器里测不到 */
async function probeCdnTarget(target) {
  try {
    const { res, bytes } = await probeFetch(target.url, { range: true })
    const acao = res.headers.get('access-control-allow-origin')
    if (!res.ok && res.status !== 206) return fail(target, `HTTP ${res.status}`)
    if (!acao) return fail(target, '无 Access-Control-Allow-Origin（跨域已关闭）')
    if (bytes === 0) return fail(target, '响应体为空，无法计量')
    return ok(target, `HTTP ${res.status} · ${bytes} B · ACAO=${acao}`)
  } catch (err) {
    return fail(target, briefError(err))
  }
}

/** LibreSpeed 节点：empty.php 需可达且开跨域 */
async function probeLibrespeedNode(node) {
  try {
    const { res } = await probeFetch(`${node.base}/empty.php?probe=1`)
    const acao = res.headers.get('access-control-allow-origin')
    if (!res.ok) return fail(node, `HTTP ${res.status}`)
    if (!acao) return fail(node, '无 Access-Control-Allow-Origin（跨域已关闭）')
    return ok(node, `HTTP ${res.status} · ACAO=${acao}`)
  } catch (err) {
    return fail(node, briefError(err))
  }
}

/** iframe 挂件：只需页面本身可访问（嵌入不受 CORS 约束） */
async function probeWidget(widget) {
  try {
    const { res } = await probeFetch(widget.src)
    if (res.status >= 400) return fail(widget, `HTTP ${res.status}`)
    return ok(widget, `HTTP ${res.status}`)
  } catch (err) {
    return fail(widget, briefError(err))
  }
}

const ok = (item, detail) => ({ name: item.name ?? item.engine ?? item.base, ok: true, detail })
const fail = (item, detail) => ({ name: item.name ?? item.engine ?? item.base, ok: false, detail })

function briefError(err) {
  const name = err?.name ?? 'Error'
  if (name === 'TimeoutError' || name === 'AbortError') return `超时（>${TIMEOUT_MS / 1000}s）`
  return `${name}${err?.cause?.code ? ` ${err.cause.code}` : ''}`
}

function writeStepSummary(rows) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  const failed = rows.filter((r) => !r.ok)
  const lines = [
    failed.length ? `## ⚠️ ${failed.length} 个第三方测速目标失效` : '## ✅ 第三方测速目标全部正常',
    '',
    '| 目标 | 状态 | 详情 |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| ${r.name} | ${r.ok ? 'OK' : 'FAIL'} | ${r.detail} |`),
    '',
    failed.length
      ? '处理办法：替换 `config/speed-targets.json` 中失效的 URL（新源必须开放跨域），并更新 `lastVerified`。'
      : '',
  ]
  appendFileSync(path, lines.join('\n') + '\n')
}

function report(rows, asJson) {
  const failed = rows.filter((r) => !r.ok)
  if (asJson) {
    console.log(JSON.stringify({ total: rows.length, failed: failed.length, rows }, null, 2))
  } else {
    for (const r of rows) console.log(`${r.ok ? '  OK ' : ' FAIL'} ${r.name} — ${r.detail}`)
    console.log(`\n${rows.length - failed.length}/${rows.length} 个目标正常`)
    if (failed.length) {
      console.log('失效清单：')
      for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`)
      console.log('处理：更新 config/speed-targets.json 中失效目标的 URL（新源须开放跨域），并刷新 lastVerified。')
    }
  }
  writeStepSummary(rows)
  process.exit(failed.length > 0 ? 1 : 0)
}

const asJson = process.argv.includes('--json')
const config = JSON.parse(readFileSync(CONFIG, 'utf8'))

const rows = []
rows.push(...(await Promise.all(config.cdnTargets.map(probeCdnTarget))))
rows.push(...(await Promise.all(config.librespeedNodes.map(probeLibrespeedNode))))
rows.push(...(await Promise.all(config.widgets.map(probeWidget))))
report(rows, asJson)
