// 自动驱动线上站点录一段约 3 分钟的演示视频：CDP screencast 出帧 + 每条字幕带底部的进度线保证持续有帧，
// 再按真实帧间隔交给 ffmpeg concat，这样静止段不会被剪掉、时长对得上分镜稿。
// 需要 ffmpeg：npm install --no-save ffmpeg-static（包体自带 exe；不写进 package.json 是为了不给纯前端项目挂 80MB 依赖）
// 用法：node scripts/make-demo-video.mjs [--url=...] [--out=docs/demo.mp4]
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DESKTOP = { w: 1280, h: 720 }
const MOBILE = { w: 375, h: 780 }
let W = DESKTOP.w, H = DESKTOP.h
const PORT = 9372
const PROFILE = join(tmpdir(), 'cdp-demo-' + Date.now())
const FRAMES = join(tmpdir(), 'cdp-demo-frames-' + Date.now())
const DL = join(tmpdir(), 'cdp-demo-dl-' + Date.now())
const OUT = join(ROOT, (process.argv.find((a) => a.startsWith('--out=')) || '--out=docs/demo.mp4').split('=')[1])
const BASE = (process.argv.find((a) => a.startsWith('--url=')) || '--url=https://mem-scheduler-nwdvyg6mjmb.qoder.zone').split('=')[1]

const ffmpeg = require('ffmpeg-static')
if (!ffmpeg || !existsSync(ffmpeg)) {
  console.error('缺 ffmpeg：先跑 npm install --no-save ffmpeg-static')
  process.exit(1)
}
const chrome = [process.env.CHROME, ...['chromium-1248', 'chromium-1243', 'chromium-1237']
  .map((d) => join(homedir(), 'AppData', 'Local', 'ms-playwright', d, 'chrome-win64', 'chrome.exe'))]
  .find((p) => p && existsSync(p))
if (!chrome) { console.error('找不到 Chromium：把 CHROME 指向 chrome.exe'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(FRAMES, { recursive: true })
mkdirSync(DL, { recursive: true })
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`], { stdio: 'ignore' })

let ver = null
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() } catch { await sleep(300) } }
if (!ver) { console.error('Chromium 未就绪'); process.exit(1) }
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?url=about%3Ablank`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let mid = 0
const pending = new Map()
const frames = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Page.screencastFrame') {
    const f = m.params
    const p = join(FRAMES, String(frames.length).padStart(4, '0') + '.jpg')
    writeFileSync(p, Buffer.from(f.data, 'base64'))
    frames.push({ p, t: f.metadata.timestamp })
    send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  }
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
})
const send = async (method, params = {}, tries = 6) => {
  // 导航瞬间 target 会短暂 detach，回 -32000 "Not attached to an active page"，重试即可，不能让它炸掉整段录制
  for (let i = 0; ; i++) {
    const id = ++mid
    const p = new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
    try { return await p } catch (e) {
      if (i >= tries || !/-32000|Not attached|target closed/i.test(String(e.message))) throw e
      await sleep(400)
    }
  }
}
const evp = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('PAGE: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  return r.result.value
}
await send('Page.enable'); await send('Runtime.enable')
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true })

async function go(route, mobile = false) {
  const s = mobile ? MOBILE : DESKTOP
  W = s.w; H = s.h
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile })
  await send('Page.navigate', { url: 'about:blank' }); await sleep(500)
  await send('Page.navigate', { url: BASE + '/#' + route })
}
async function until(expr, ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await evp(`Promise.resolve(${expr})`)) return true; await sleep(400) }
  return false
}
// 按可见文本点按钮，比记 DOM 类名稳
const clickText = (sel, txt) => evp(`(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent && e.innerText.trim().includes(${JSON.stringify(txt)}))
  if (!els.length) return false
  els[0].click(); return true
})()`)

// 字幕带 + 底部进度线。坐标全部在 Node 侧算好再插值：页面里没有 W / H 这些变量
async function caption(text) {
  await evp(`(() => {
    let bar = document.getElementById('__cap')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = '__cap'
      bar.setAttribute('style', [
        'position:fixed;left:${Math.round(W * 0.03)}px;right:${Math.round(W * 0.03)}px;bottom:${Math.round(H * 0.04)}px;z-index:2147483000',
        'box-sizing:border-box;padding:${Math.round(H * 0.026)}px ${Math.round(W * 0.024)}px;border-radius:${Math.round(H * 0.02)}px',
        'background:rgba(0,18,52,.88);color:#fff;font-size:${Math.round(Math.min(H * 0.038, W * 0.05))}px;font-weight:600;line-height:1.4',
        'font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;letter-spacing:.4px',
        'border:1px solid rgba(255,255,255,.18);overflow:hidden',
        'box-shadow:0 ${Math.round(H * 0.012)}px ${Math.round(H * 0.04)}px rgba(0,10,30,.5)'
      ].join(';'))
      const t = document.createElement('div'); t.id = '__cap_t'; bar.appendChild(t)
      const k = document.createElement('div')
      k.setAttribute('style', 'margin-top:${Math.round(H * 0.016)}px;height:3px;border-radius:2px;background:rgba(255,255,255,.22)')
      const f = document.createElement('div'); f.id = '__cap_f'
      f.setAttribute('style', 'height:3px;border-radius:2px;width:0;background:#7fc4ff')
      k.appendChild(f); bar.appendChild(k)
      document.body.appendChild(bar)
    }
    document.getElementById('__cap_t').textContent = ${JSON.stringify(text)}
    document.getElementById('__cap_f').style.width = '0'
    return true
  })()`)
}
const progress = (p) => evp(`(() => {
  const f = document.getElementById('__cap_f')
  if (!f) return false
  f.style.width = Math.round(${p.toFixed(3)} * 100) + '%'
  return true
})()`)
// 停在某一页时顺手慢滚：既让评委看到长页面下半部分，也保证画面一直在出帧
const nudge = (sel) => evp(`(() => {
  const sc = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'null'} || document.scrollingElement || document.documentElement
  if (!sc || sc.scrollHeight <= sc.clientHeight + 30) return 'static'
  if (window.__dir === undefined) window.__dir = 1
  const max = sc.scrollHeight - sc.clientHeight
  let next = sc.scrollTop + window.__dir * ${Math.round(H * 0.28)}
  if (next >= max) { next = max; window.__dir = -1 }
  if (next <= 0) { next = 0; window.__dir = 1 }
  sc.scrollTop = next
  return 'scroll'
})()`)
async function dwell(ms, sel) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    await sleep(400)
    await progress(Math.min(1, (ms - (end - Date.now())) / ms))
    await nudge(sel)
  }
}
const clearCaption = () => evp(`(() => { const b = document.getElementById('__cap'); if (b) b.remove(); return true })()`)
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.round(s % 60)).padStart(2, '0')

const SCENES = [
  { cap: '① 打开链接就能用：免登录 · 无后端 · 真实脱敏数据首屏直接播种进浏览器', route: '/', wait: `!!document.querySelector('.hero p')`, dwell: 14000 },
  { cap: '② 五类基础台账：班级 / 教师 / 课程 / 教室 / 学期，边查边改', route: '/entities', wait: `!![...document.querySelectorAll('.el-table')].find((e) => e.offsetWidth > 0)`, dwell: 11000 },
  { cap: '③ 学期体检：整套规则扫全学期排课，硬冲突按「错误 / 提醒」分级列出来', route: '/audit', wait: `!!document.querySelector('.sum-card .sum-num')`, dwell: 13000 },
  { cap: '④ 展开任意一条冲突，点「跳转到排课」，落地就是那张有问题的排课单', route: null,
    act: async () => { await evp(`(() => { const i = document.querySelector('.el-table__expand-icon'); if (i) i.click(); return !!i })()`); await sleep(1200); await clickText('.expand-actions button', '跳转到排课'); await until(`!!document.querySelector('.topbar button')`) }, dwell: 9000 },
  { cap: '⑤ ⚡ 一键自动排课：贪心算法 + 位图周次，把待排任务一次填进网格', route: null,
    act: async () => { await until(`!!document.querySelector('.task-item')`); await sleep(1800); await clickText('.topbar button', '一键自动排课') }, dwell: 14000 },
  { cap: '⑥ 💾 保存草稿：网格上的临时结果正式落进浏览器数据库', route: null,
    act: async () => { await clickText('.topbar button', '保存（'); await sleep(2500) }, dwell: 6000 },
  { cap: '⑦ 保存后再体检：扫描数从 16 条涨到 26 条，新排进去的课一起被复检', route: '/audit', wait: `!!document.querySelector('.sum-card .sum-num')`, dwell: 10000 },
  { cap: '⑧ 故意把已排好的课再放回它自己占着的格子，点保存', route: '/schedule',
    wait: `!!document.querySelector('.task-item')`, dwell: 0,
    act: async () => {
      await sleep(1500)
      const picked = await evp(`(() => {
        const card = [...document.querySelectorAll('.tt-cell .tt-card')][0]
        if (!card) return false
        const name = card.querySelector('.tt-card-name')?.innerText.trim()
        const item = [...document.querySelectorAll('.task-item')].find((e) => e.querySelector('.task-item-name')?.innerText.trim() === name)
        if (item) item.click()
        return !!item
      })()`)
      await sleep(800)
      const placed = await evp(`(() => {
        const cell = [...document.querySelectorAll('.tt-cell')].find((c) => c.querySelector('.tt-card'))
        if (cell) cell.click()
        return !!cell
      })()`)
      console.log('  · 造冲突：选中已排课程=' + picked + ' 放回格子=' + placed)
      await sleep(1000)
      await clickText('.topbar button', '保存（')
      if (!await until(`!!document.querySelector('.el-message-box')`, 20000)) console.log('  ! 冲突确认框没出现')
    } },
  { cap: '⑨ 保存前就弹硬冲突确认，写清楚撞了谁、撞在哪：可以返回修改，也可以强制保存', route: null, dwell: 12000,
    post: async () => { await clickText('.el-message-box__btns button', '返回修改'); await sleep(900); await clickText('.topbar button', '放弃改动'); await sleep(1000) } },
  { cap: '⑩ 课表查看 · 教师视角：按老师聚合，一个人一周的课一屏看全', route: '/timetable?mode=teacher&teacher=19', wait: `!!document.querySelector('.tt-view')`, dwell: 11000 },
  { cap: '⑪ 一键导出 xlsx：排好的课表直接变成可发给教务的文件', route: null, act: async () => { await clickText('button', '导出 xlsx') }, dwell: 8000 },
  { cap: '⑫ 手机上也排得开：375 窄屏自动切抽屉式任务列表，页面本身不横向溢出', route: '/schedule', mobile: true, wait: `!!document.querySelector('.topbar button')`, dwell: 11000 }
]

await send('Page.navigate', { url: 'about:blank' })
await send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: DESKTOP.w, maxHeight: DESKTOP.h, everyNthFrame: 1 })

const t0 = Date.now()
const events = []
let done = 0
try {
  for (const s of SCENES.slice(0, Number(process.argv.find((a) => a.startsWith('--scenes='))?.split('=')[1] || SCENES.length))) {
    console.log('scene ' + (++done) + '/' + SCENES.length + ' ' + s.cap.slice(0, 22))
    if (s.route) { await go(s.route, !!s.mobile); if (s.wait && !await until(s.wait, 40000)) console.log('  ! wait timeout: ' + s.route) }
    await sleep(1200)
    await caption(s.cap)
    // 记下字幕出现的墙钟时刻，编帧时换算成视频时间轴，分镜稿的时间码就是实测值而不是估算值
    events.push({ cap: s.cap, at: Date.now() / 1000 })
    await sleep(700)
    if (s.act) { try { await s.act() } catch (e) { console.log('  ! act failed: ' + e.message) }; await sleep(500) }
    await dwell(s.dwell, s.dwellSel)
    await clearCaption()
    if (s.post) { try { await s.post() } catch (e) { console.log('  ! post failed: ' + e.message) } }
    await sleep(400)
  }
} catch (e) {
  console.log('ABORT at scene ' + done + ': ' + e.message)
}
await send('Page.stopScreencast').catch(() => {})
const wall = (Date.now() - t0) / 1000
console.log('frames=' + frames.length + ' wall=' + wall.toFixed(1) + 's')

if (frames.length < 8) { console.error('帧太少，没录到东西'); process.exit(1) }
// concat 里 duration 是对「它前面那个 file」生效的，所以必须 file 在前、duration 在后。
// 每帧时长 = 到下一帧的真实间隔；静止段靠字幕进度线兜底出帧，所以这里只做下限和异常上限，不再压成 1.6s。
const list = join(tmpdir(), 'cdp-demo-list-' + Date.now() + '.txt')
let txt = ''
let total = 0
const starts = []
for (let i = 0; i < frames.length; i++) {
  const dur = i === frames.length - 1 ? 1.2 : Math.min(5, Math.max(0.05, frames[i + 1].t - frames[i].t))
  starts.push(total)
  total += dur
  txt += `file '${frames[i].p.replace(/\\/g, '/')}'\nduration ${dur.toFixed(3)}\n`
}
txt += `file '${frames[frames.length - 1].p.replace(/\\/g, '/')}'\n`
writeFileSync(list, txt, 'utf8')
console.log('video=' + total.toFixed(1) + 's')

// 字幕时刻 -> 视频时间码（取该时刻之前最近的一帧）
const tl = events.map((e) => {
  let idx = 0
  for (let i = 0; i < frames.length; i++) { if (frames[i].t <= e.at) idx = i; else break }
  return { t: +starts[idx].toFixed(1), mmss: fmt(starts[idx]), cap: e.cap }
})
writeFileSync(join(ROOT, 'docs', 'demo-timeline.json'), JSON.stringify({ videoSeconds: +total.toFixed(1), scenes: tl }, null, 2), 'utf8')
tl.forEach((x) => console.log(x.mmss + '  ' + x.cap.slice(0, 30)))

mkdirSync(dirname(OUT), { recursive: true })
const ff = spawn(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `scale=${DESKTOP.w}:${DESKTOP.h}:force_original_aspect_ratio=decrease,pad=${DESKTOP.w}:${DESKTOP.h}:(ow-iw)/2:(oh-ih)/2:color=black`,
  '-pix_fmt', 'yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-movflags', '+faststart', OUT],
  { stdio: ['ignore', 'ignore', 'pipe'] })
let ffErr = ''
ff.stderr.on('data', (d) => { ffErr += d.toString() })
const code = await new Promise((r) => ff.on('close', r))
if (code !== 0) console.error('ffmpeg 退出 ' + code + '\n' + ffErr.split('\n').slice(-12).join('\n'))

console.log('out=' + OUT + ' exists=' + existsSync(OUT) + (existsSync(OUT) ? ' kb=' + Math.round(statSync(OUT).size / 1024) : ''))
try { rmSync(FRAMES, { recursive: true, force: true }) } catch {}
try { rmSync(DL, { recursive: true, force: true }) } catch {}
await send('Browser.close').catch(() => {})
ws.close()
try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
child.kill()
process.exit(existsSync(OUT) && code === 0 ? 0 : 1)
