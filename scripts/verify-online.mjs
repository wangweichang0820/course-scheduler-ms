// 线上站点验收：用全新浏览器 profile 模拟「评委的无痕环境」，真跑参赛帖里写的 5 步体验路径。
// 之所以要全新 profile：IndexedDB 为空才能验证首屏播种，评委机器上是没有我们本地数据的。
// 用法：node scripts/verify-online.mjs [--url=https://...] [--headed]
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, rmSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SHOT = join(ROOT, 'docs', 'screenshots')
const DL = join(tmpdir(), 'mem-dl-' + Date.now())
const PORT = 9361
const PROFILE = join(tmpdir(), 'cdp-online-' + Date.now())
const BASE = (process.argv.find((a) => a.startsWith('--url=')) || '--url=https://mem-scheduler-nwdvyg6mjmb.qoder.zone').split('=')[1]

const chrome = [process.env.CHROME, ...['chromium-1248', 'chromium-1243', 'chromium-1237']
  .map((d) => join(homedir(), 'AppData', 'Local', 'ms-playwright', d, 'chrome-win64', 'chrome.exe'))]
  .find((p) => p && existsSync(p))
if (!chrome) { console.error('找不到 Chromium：把 CHROME 指向 chrome.exe'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
const consoleErrors = []
const failedReq = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Log.entryAdded' && m.entry.level === 'error') consoleErrors.push(m.entry.text.slice(0, 160))
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 160))
  if (m.method === 'Network.loadingFailed') failedReq.push(m.params.errorText)
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) failedReq.push(m.params.response.url.slice(-48) + ' -> ' + m.params.response.status)
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
})
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++mid; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evp = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('PAGE: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  return r.result.value
}
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')
await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true })

// 每档先回 about:blank，避免 hash 路由只改片段不整页重载
async function go(route, w = 1920, h = 1080) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
  await send('Page.navigate', { url: 'about:blank' }); await sleep(400)
  await send('Page.navigate', { url: BASE + '/#' + route })
}
async function until(expr, label, ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await evp(`Promise.resolve(${expr})`)) return true; await sleep(500) }
  throw new Error('等待超时：' + label)
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOT, name), Buffer.from(r.data, 'base64'))
  return Math.round(statSync(join(SHOT, name)).size / 1024) + 'KB'
}
// 按可见文本点按钮，比记 DOM 类名稳
const clickText = (sel, txt) => evp(`(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent && e.innerText.trim().includes(${JSON.stringify(txt)}))
  if (!els.length) return false
  els[0].click(); return true
})()`)

// allowAndName 会把下载项存成 GUID 文件名，所以只能按体积判断是不是拿到了真 xlsx
async function waitForDownload(dir, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (existsSync(dir)) {
      const f = readdirSync(dir).map((n) => ({ n, bytes: statSync(join(dir, n)).size })).sort((a, b) => b.bytes - a.bytes)[0]
      if (f && f.bytes > 1000) return { name: f.n, kb: Math.round(f.bytes / 1024) }
    }
    await sleep(500)
  }
  return null
}

const R = { base: BASE, checkedAt: new Date().toISOString().slice(0, 19), steps: [] }
const step = (n, ok, detail) => { R.steps.push({ n, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + n + ' :: ' + JSON.stringify(detail)) }

try {
  // ---- 版本：线上必须是本地这份构建，否则评委看到的是旧版 ----
  await go('/')
  await until(`!!(document.querySelector('.hero p') && /\\d/.test(document.querySelector('.hero p').innerText))`, '首屏 hero')
  R.version = await evp(`(() => {
    const s = [...document.querySelectorAll('script[src]')].map((e) => e.src.split('/').pop())
    const l = document.querySelector('link[rel="icon"]')
    return { bundle: s, favicon: l ? l.href.slice(0, 24) : null }
  })()`)
  step('0 线上构建版本', R.version.bundle.includes('index-hZlrFUt7.js') && !!R.version.favicon, R.version)

  // ---- 第 1 步：首屏总览（全新 profile => IndexedDB 为空 => 这里必须看到播种结果）----
  R.step1 = await evp(`(() => ({
    heroP: document.querySelector('.hero p')?.innerText.trim(),
    stats: [...document.querySelectorAll('.stat-num')].map((e) => e.innerText.trim()),
    panels: [...document.querySelectorAll('.card-header span')].map((e) => e.innerText.trim())
  }))()`)
  step('1 首屏播种计数', R.step1.heroP === '9 个班级 · 71 项教学任务 · 16 条排课 · 学期共 19 周' && R.step1.stats.join('/') === '9/53/50/6', R.step1)
  await shot('online-1-home.png')

  // ---- 第 2 步：学期体检 → 展开首行 → 跳转到排课 ----
  await go('/audit')
  await until(`!!(document.querySelector('.sum-card .sum-num'))`, '体检汇总卡')
  R.step2 = await evp(`(() => {
    const cards = [...document.querySelectorAll('.sum-card')]
    const num = (t) => { const c = cards.find((e) => e.querySelector('.sum-label')?.innerText.trim() === t); return c ? c.querySelector('.sum-num').innerText.trim() : null }
    return { error: num('错误'), warning: num('提醒'), scanned: num('扫描排课'), hit: num('涉及记录'), rows: document.querySelectorAll('.el-table__body tr.el-table__row').length }
  })()`)
  await evp(`(() => { const i = document.querySelector('.el-table__expand-icon'); if (i) i.click(); return !!i })()`)
  await sleep(600)
  const jumped = await clickText('.expand-actions button', '跳转到排课')
  await sleep(1200)
  R.step2.jumped = jumped
  R.step2.hashAfterJump = await evp(`location.hash`)
  step('2 学期体检 + 跳转到排课', R.step2.scanned === '16' && R.step2.jumped && R.step2.hashAfterJump.includes('/schedule'), R.step2)
  await shot('online-2-audit.png')

  // ---- 第 3 步：一键自动排课 ----
  await go('/schedule')
  await until(`!!(document.querySelector('.topbar button'))`, '排课工具条')
  R.step3 = await evp(`(() => {
    const b = [...document.querySelectorAll('.topbar button')].map((e) => e.innerText.trim())
    return { buttons: b, pending: (b.find((t) => t.includes('一键自动排课')) || '').match(/待排 (\\d+)/)?.[1] }
  })()`)
  const autoOk = await clickText('.topbar button', '一键自动排课')
  await until(`(() => { const b=[...document.querySelectorAll('.topbar button')].find(e=>e.innerText.includes('保存（')); return b && /保存（([1-9]\\d*) 新/.test(b.innerText.trim()) })()`, '自动排课产生草稿', 30000)
  R.step3.autoClicked = autoOk
  R.step3.saveBtnAfterAuto = await evp(`[...document.querySelectorAll('.topbar button')].find((e) => e.innerText.includes('保存（'))?.innerText.trim()`)
  step('3 一键自动排课', !!R.step3.pending && Number(R.step3.pending) > 0 && /保存（[1-9]/.test(R.step3.saveBtnAfterAuto || ''), R.step3)
  await shot('online-3-schedule-draft.png')

  // ---- 第 4 步：保存 → 冲突确认 → 强制保存 ----
  await clickText('.topbar button', '保存（')
  await sleep(1200)
  const box = await evp(`(() => {
    const b = document.querySelector('.el-message-box')
    if (!b) return null
    return { title: b.querySelector('.el-message-box__title')?.innerText.trim(), body: b.querySelector('.el-message-box__message')?.innerText.trim().slice(0, 120),
      btns: [...b.querySelectorAll('button')].map((e) => e.innerText.trim()) }
  })()`)
  R.step4 = { conflictBox: box }
  if (box) { R.step4.forced = await clickText('.el-message-box__btns button', '强制保存'); await sleep(2000) }
  R.step4.dirtyTagAfter = await evp(`!!([...document.querySelectorAll('.el-tag')].find((e) => e.innerText.includes('未保存的改动')))`)
  R.step4.saveBtnAfter = await evp(`[...document.querySelectorAll('.topbar button')].find((e) => e.innerText.includes('保存（'))?.innerText.trim()`)
  step('4 保存 / 冲突确认 / 强制保存', R.step4.dirtyTagAfter === false && /保存（0 新/.test(R.step4.saveBtnAfter || ''), R.step4)
  await shot('online-4-save-conflict.png')

  // ---- 第 4b：回到体检，看扫描数是否随保存变化 ----
  await go('/audit')
  await until(`!!(document.querySelector('.sum-card .sum-num'))`, '体检汇总卡')
  R.step4b = await evp(`(() => {
    const cards = [...document.querySelectorAll('.sum-card')]
    const num = (t) => { const c = cards.find((e) => e.querySelector('.sum-label')?.innerText.trim() === t); return c ? c.querySelector('.sum-num').innerText.trim() : null }
    return { error: num('错误'), warning: num('提醒'), scanned: num('扫描排课') }
  })()`)
  step('4b 保存后体检扫描数变化', Number(R.step4b.scanned) > Number(R.step2.scanned), { before: R.step2.scanned, after: R.step4b })

  // ---- 第 5 步：课表查看 → 教师视角 → 导出 xlsx ----
  // 教师 id=19（言未晞）在当学期有 4 个已排课位，是从 real-data.json 反查出来的，不是随手挑的
  await go('/timetable?mode=teacher&teacher=19')
  await until(`!!(document.querySelector('.tt-view'))`, '课表查看')
  await sleep(1500)
  R.step5 = await evp(`(() => {
    const btn = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === '导出 xlsx')
    const active = [...document.querySelectorAll('.el-radio-button')].find((e) => e.className.includes('is-active'))
    return { activeMode: active ? active.innerText.trim() : null, exportDisabled: btn ? btn.disabled : null }
  })()`)
  const expOk = await clickText('button', '导出 xlsx')
  const dl = await waitForDownload(DL, 25000)
  R.step5.exportClicked = expOk
  R.step5.downloaded = dl
  step('5 教师视角导出 xlsx', R.step5.exportDisabled === false && expOk && !!dl && dl.kb > 3, R.step5)
  await shot('online-5-timetable-teacher.png')

  // ---- 第 5b：自动排课走的是避让逻辑，不会触发「保存冲突确认」。这里手工造一个真冲突把它验出来 ----
  await go('/schedule')
  await until(`!!document.querySelector('.task-item')`, '任务列表')
  await sleep(800)
  R.step5b = {}
  // 上一版随便挑了第一个任务放进第一个已占用格子，结果是另一位老师的课 —— 不冲突是对的，错在造冲突的方式。
  // 真正能触发硬冲突的：把同一门课再放回到它自己已经占着的格子（同师同班同时）
  const pair = await evp(`(() => {
    const card = [...document.querySelectorAll('.tt-cell .tt-card')][0]
    if (!card) return { err: 'no card' }
    const name = card.querySelector('.tt-card-name')?.innerText.trim()
    const item = [...document.querySelectorAll('.task-item')].find((e) => e.querySelector('.task-item-name')?.innerText.trim() === name)
    if (!item) return { name, matched: false }
    item.click()
    return { name, matched: true }
  })()`)
  R.step5b.pair = pair
  await sleep(400)
  R.step5b.cellClicked = await evp(`(() => {
    const cell = [...document.querySelectorAll('.tt-cell')].find((c) => c.querySelector('.tt-card'))
    if (!cell) return false
    cell.click(); return true
  })()`)
  await sleep(600)
  R.step5b.saveBtn = await evp(`[...document.querySelectorAll('.topbar button')].find((e) => e.innerText.includes('保存（'))?.innerText.trim()`)
  await clickText('.topbar button', '保存（')
  await sleep(1500)
  R.step5b.conflictBox = await evp(`(() => {
    const b = document.querySelector('.el-message-box')
    if (!b) return null
    return { title: b.querySelector('.el-message-box__title')?.innerText.trim(),
      body: b.querySelector('.el-message-box__message')?.innerText.trim().slice(0, 150),
      btns: [...b.querySelectorAll('button')].map((e) => e.innerText.trim()) }
  })()`)
  if (R.step5b.conflictBox) await shot('online-5b-conflict-dialog.png')
  if (R.step5b.conflictBox) R.step5b.backToEdit = await clickText('.el-message-box__btns button', '返回修改')
  await sleep(600)
  R.step5b.discarded = await clickText('.topbar button', '放弃改动')
  await sleep(800)
  step('5b 同课重复排入已占格子 → 保存冲突确认框',
    !!R.step5b.conflictBox && R.step5b.conflictBox.btns.includes('强制保存'), R.step5b)

  // ---- 375 视口：手机模拟（真机仍需本人跑一次）----
  // 这里传的是 JS 表达式，不是 CSS 选择器 —— 上一版把选择器当表达式拼进去，三个页面直接语法错，却被宽松断言掩盖成「通过」
  R.mobile = {}
  for (const [route, wait] of [
    ['/', `!!document.querySelector('.hero p')`],
    ['/entities', `!![...document.querySelectorAll('.el-table')].find((e) => e.offsetWidth > 0)`],
    ['/schedule', `!!document.querySelector('.topbar button')`],
    ['/timetable', `!!document.querySelector('.tt-view')`]
  ]) {
    await go(route, 375, 780)
    await until(wait, '375 ' + route, 40000)
    await sleep(1200)
    R.mobile[route] = await evp(`(() => ({
      hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brand: document.querySelector('.brand-title')?.innerText.trim(),
      hitSchool: /北交大|北京交通大学|bjtu/i.test(document.body.innerText)
    }))()`)
  }
  await go('/entities', 375, 780)
  await until(`(() => { const t=[...document.querySelectorAll('.el-table')].filter((e)=>e.offsetWidth>0)[0]; return !!(t && t.querySelector('tbody tr')) })()`, '375 表格行')
  await sleep(1000)
  R.mobile.nameCol = await evp(`(() => {
    const tbl = [...document.querySelectorAll('.el-table')].filter((e) => e.offsetWidth > 0)[0]
    const ths = [...tbl.querySelectorAll('thead th')].map((th) => ({ t: th.innerText.trim(), r: th.getBoundingClientRect(), pos: getComputedStyle(th).position }))
    const name = ths.find((x) => x.t === '班级名称'), op = ths.find((x) => x.t === '操作')
    return { nameW: Math.round(name.r.width), namePos: name.pos, opPos: op ? op.pos : null,
      visibleNameW: op ? Math.round(Math.min(name.r.right, op.r.x) - name.r.x) : Math.round(name.r.width) }
  })()`)
  const mobPages = Object.entries(R.mobile).filter(([k]) => k !== 'nameCol')
  step('6 375 视口四页无溢出 + 名称列不被遮挡',
    mobPages.length === 4
      && mobPages.every(([, v]) => v.hOverflow === 0 && v.hitSchool === false && v.brand === '研究生排课工作台')
      && R.mobile.nameCol.visibleNameW > 120,
    { pages: Object.fromEntries(mobPages), nameCol: R.mobile.nameCol })
  await shot('online-6-mob375-entities.png')

  R.consoleErrors = consoleErrors
  R.failedReq = failedReq
  step('7 console 零错误 / 无失败请求', consoleErrors.length === 0 && failedReq.length === 0, { consoleErrors, failedReq })
} catch (e) {
  R.fatal = String(e.message)
  console.log('FATAL ' + e.message)
}

mkdirSync(join(ROOT, 'scripts'), { recursive: true })
writeFileSync(join(ROOT, 'scripts', 'verify-online-report.json'), JSON.stringify(R, null, 2), 'utf8')
R.passed = R.steps.filter((s) => s.ok).length
console.log('SUMMARY ' + R.passed + '/' + R.steps.length + ' passed')
try { rmSync(DL, { recursive: true, force: true }) } catch {}
await send('Browser.close').catch(() => {})
ws.close()
try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
child.kill()
process.exit(R.passed === R.steps.length && !R.fatal ? 0 : 1)
