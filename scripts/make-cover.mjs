// 生成参赛帖 16:9 封面图：打开真实排课网格，注入压字层后截图，所以背景永远是当前构建结果
// 用法：先 npm run preview（占用 4173），再 node scripts/make-cover.mjs [宽] [高]
// 超 500KB 或想换尺寸时：node scripts/make-cover.mjs 1600 900
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = 9356
const PROFILE = join(tmpdir(), 'cdp-cover-' + Date.now())
const chrome = [process.env.CHROME, ...['chromium-1248', 'chromium-1243', 'chromium-1237']
  .map((d) => join(homedir(), 'AppData', 'Local', 'ms-playwright', d, 'chrome-win64', 'chrome.exe'))]
  .find((p) => p && existsSync(p))
if (!chrome) {
  console.error('找不到 Chromium：把 CHROME 指向 chrome.exe，或装一份 Playwright chromium')
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
let ver = null
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() } catch { await sleep(300) } }
const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?url=about%3Ablank`, { method: 'PUT' })).json()
const ws = new WebSocket(t.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let mid = 0; const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++mid; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
// 页面侧抛异常时 Runtime.evaluate 不报错，只给 exceptionDetails，必须自己抛出来
const evp = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('PAGE: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  return r.result.value
}
await send('Page.enable'); await send('Runtime.enable')

const W = Number(process.argv[2] || 1920), H = Number(process.argv[3] || 1080)
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:4173/#/schedule' })
const dl = Date.now() + 30000
while (Date.now() < dl) { if (await evp(`Promise.resolve(document.querySelectorAll('.sg-card, .tt-card, [class*="card"]').length > 4)`)) break; await sleep(400) }
await sleep(1500)

const cards = await evp(`document.querySelectorAll('[class*="card"]').length`)

// 压字层：尺寸全部在 Node 侧算好再插值进页面代码，页面里没有 W/H 这两个变量
const px = (v) => Math.round(v) + 'px'
const FONT = 'font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif'
const injected = await evp(`(() => {
  const add = (id, style, html) => {
    const d = document.createElement('div')
    d.id = id
    d.setAttribute('style', style)
    d.innerHTML = html
    document.body.appendChild(d)
  }
  add('__scrim', [
    'position:fixed;inset:0;z-index:99998;pointer-events:none',
    'background:linear-gradient(180deg,rgba(0,22,64,0.72) 0%,rgba(0,22,64,0.26) 15%,rgba(0,22,64,0) 32%,rgba(0,22,64,0) 48%,rgba(0,22,64,0.42) 68%,rgba(0,20,58,0.86) 100%)'
  ].join(';'), '')
  add('__hero', [
    'position:fixed;left:50%;top:${px(H * 0.74)};transform:translate(-50%,-50%);z-index:99999',
    'width:${px(W * 0.8)};box-sizing:border-box;text-align:center',
    'padding:${px(H * 0.038)} ${px(W * 0.03)};border-radius:${px(H * 0.026)}',
    'background:rgba(0,20,58,.52);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)',
    'border:1px solid rgba(255,255,255,.2);box-shadow:0 ${px(H * 0.018)} ${px(H * 0.05)} rgba(0,15,45,.4)',
    '${FONT}'
  ].join(';'),
    '<div style="color:#fff;font-size:${px(H * 0.078)};font-weight:800;letter-spacing:${px(H * 0.005)};line-height:1.25;text-shadow:0 ${px(H * 0.006)} ${px(H * 0.02)} rgba(0,15,45,.85)">一张网格里，排完整个学期</div>' +
    '<div style="margin-top:${px(H * 0.024)};color:rgba(255,255,255,.94);font-size:${px(H * 0.032)};font-weight:500;letter-spacing:${px(H * 0.002)}">9 个班 · 50 位教师 · 53 门课 · 纯前端，打开链接就能用</div>' +
    '<div style="margin-top:${px(H * 0.018)};color:rgba(255,255,255,.75);font-size:${px(H * 0.024)}">冲突即时高亮 · 拖拽排课 · 一键导出 xlsx</div>')
  add('__seal', [
    'position:fixed;right:${px(W * 0.04)};bottom:${px(H * 0.05)};z-index:99999',
    'color:#fff;font-size:${px(H * 0.024)};letter-spacing:${px(H * 0.001)}',
    'padding:${px(H * 0.012)} ${px(W * 0.02)};border:1px solid rgba(255,255,255,.45);border-radius:999px',
    'background:rgba(0,22,64,.42)',
    '${FONT}'
  ].join(';'), '2026 Qoder 高校创造力大赛 · StudyHack')
  return ['__scrim', '__hero', '__seal'].filter((i) => document.getElementById(i)).length
})()`)
console.log('INJECTED ' + injected)
await sleep(600)

const name = `cover-${W}x${H}.png`
const r = await send('Page.captureScreenshot', { format: 'png' })
const buf = Buffer.from(r.data, 'base64')
const file = join(ROOT, 'docs', 'screenshots', name)
writeFileSync(file, buf)
console.log(JSON.stringify({ W, H, cards, kb: Math.round(statSync(file).size / 1024), name }))
await send('Browser.close').catch(() => {})
ws.close(); try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
child.kill(); process.exit(0)
