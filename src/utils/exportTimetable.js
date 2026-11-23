// 课表导出：把「节次 × 星期」网格导出成真正的 .xlsx（ExcelJS 生成）。
//
// 旧版用 HTML 表格伪装 .xls，新版 Excel 会报「文件格式和扩展名不匹配 / 文件已损坏」，
// 这里改为生成标准 Office Open XML 工作簿，Excel / WPS 直接打开无告警。
//
// 版式与系统页面课表一致：
//   · 简版 / 分周（stacked）：白底格，同格多门课格内纵向逐条列出，
//     课程名用教学任务实色，周次 + 地点灰色小字，未设置地点更浅；
//   · 检索命中：命中格任务色浅底 + 课程名前色条，未命中课程文字淡化；
//   · 周次标注（如「本科课程」）：整格实色底 + 白字。
//
// 版式口径：
//   · 列宽按可见星期列数自适应（周末班 2 列宽、集中班 4 列中、全日制 5 列窄），
//     整表控制在 A4 横向一页宽附近；
//   · 格内多行用 richText（每行各自字体/颜色），行高按行数显式估算；
//   · 冻结标题 + 表头行与节次列；横向打印、按页宽缩放；
//   · 分周导出保持单表纵向排列，每周一个分组行，打印时每周从新页开始
//     （分组行前一行加分页符），并重复打印标题表头。
import { taskColor } from '@/utils/taskColor'
import { patternToWeeks, weeksToText } from '@/utils/weeks'
import { locationRoom } from '@/utils/schedule'

const BORDER = 'e8ecf3' // 页面网格描边
const HEAD_BG = 'f4f6fa' // 表头 / 节次列底色
const HEAD_TEXT = '1f2d3d'
const BRAND = '003690' // 品牌蓝：标题行底色
const META_TEXT = '6b7280' // 周次 / 地点 / 班级 / 教师
const SEC_TEXT = '64748b' // 课序号 [NN]
const NOLOC_TEXT = 'b0b8c4' // 未设置地点
const MASK_BG = 'dbe3ef' // 他人课程色块底色
const DIM_TEXT = '9aa4b1' // 检索未命中课程
const WEEK_BG = 'e8eefc' // 分周分组行底色
const STACK_HIT_MIX = 0.16

// 字号（pt）：打印可直接阅读，又不至于把行高撑得过大
const F_TITLE = 16
const F_HEAD = 11
const F_WEEK = 12
const F_NAME = 11 // stacked 课程名
const F_META = 9 // stacked 辅助信息
const F_PERIOD = 10
const F_PERIOD_SUB = 9

const FONT = '微软雅黑'

/** ExcelJS 体积大，动态加载，不进主包 */
let excelPromise = null
function loadExcel() {
  excelPromise ||= import('exceljs').then((m) => m.default || m)
  return excelPromise
}

/** 实色与白色按 weight 混合（Excel 不认 rgba，浅色一律换算实色） */
function mixWithWhite(hex, weight) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex.replace('#', '')
  const to = (c) => Math.round(255 - (255 - parseInt(c, 16)) * weight).toString(16).padStart(2, '0')
  return `${to(m[1])}${to(m[2])}${to(m[3])}`
}

const argb = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })
const thin = (hex) => ({ style: 'thin', color: { argb: argb(hex) } })
const boxBorder = (hex) => ({ top: thin(hex), left: thin(hex), bottom: thin(hex), right: thin(hex) })
const font = (size, { color = HEAD_TEXT, bold = false } = {}) =>
  ({ name: FONT, size, color: { argb: argb(color) }, bold })

/** 文件名里的 Windows 非法字符换成下划线 */
export function safeFileName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '课表'
}

/** 工作表名：Excel 另禁 \ / ? * [ ] : 且最长 31 字符 */
export function safeSheetName(s) {
  return (String(s || '').replace(/[\\/?*[\]:]/g, '_').trim() || '课表').slice(0, 31)
}

/** 下载 xlsx buffer：标准 OOXML MIME + .xlsx 扩展名，Excel 不再报格式不匹配 */
export function downloadXlsxBuffer(filename, buffer) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(filename)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// 数据模型（与旧版一致）
// ---------------------------------------------------------------------------

/** 把一批排课按 (day, period) 分桶 */
function buildGrid(slots) {
  const grid = {}
  for (const s of slots || []) {
    const key = `${s.day_of_week}-${s.start_period}`
    ;(grid[key] ||= []).push(s)
  }
  return grid
}

const hitSet = (ids) => new Set((ids || []).map(Number))

/** 周次标注叠进网格：band 键为真实起始节次，row 键为显示行（调用方折算好） */
function withMarks(grid, marks, { keyBy = 'band' } = {}) {
  const out = { ...(grid || {}) }
  for (const m of marks || []) {
    const key = `${m.day_of_week}-${keyBy === 'band' ? m.start_period : m.period}`
    ;(out[key] ||= []).unshift(m)
  }
  return out
}

function slotLocation(s) {
  return locationRoom(s)
}

/** 教师串：顿号换成「 -」，与页面显示口径一致 */
function teacherText(s) {
  return String(s.teacher_names || s.teacher_name || '').replaceAll('、', ' -')
}

/** 他人课程占用周次：位图优先，回退起止周 */
function maskWeeksText(it) {
  if (it.weeks_text) return it.weeks_text
  const ws = patternToWeeks(it.week_pattern)
  if (ws.length) return weeksToText(ws, { prefix: '', unit: '周' })
  const start = Number(it.start_week) || 1
  const end = Number(it.end_week) || start
  return weeksToText(Array.from({ length: end - start + 1 }, (_, i) => start + i), { prefix: '', unit: '周' })
}

// ---------------------------------------------------------------------------
// 富文本行模型：一行 = 若干 run（各自字体颜色），行末自动补换行
// ---------------------------------------------------------------------------

const run = (text, f) => ({ text: String(text ?? ''), font: f })
const line = (...runs) => runs.filter((r) => r.text !== '')

/** 行列表 -> ExcelJS richText；同时返回估算行高用的每行最大字号 */
function richTextOf(lines) {
  const richText = []
  const lineSizes = []
  lines.forEach((runs, li) => {
    const size = Math.max(...runs.map((r) => r.font.size), 6)
    lineSizes.push(size)
    runs.forEach((r, ri) => {
      const lastRun = ri === runs.length - 1
      const lastLine = li === lines.length - 1
      richText.push({ font: r.font, text: r.text + (lastRun && !lastLine ? '\n' : '') })
    })
  })
  return { richText, lineSizes }
}

/** 行高：每行按最大字号 * 1.35 累加 + 上下内边距 */
function heightOf(lines) {
  const { lineSizes } = richTextOf(lines)
  return Math.round(lineSizes.reduce((a, s) => a + s * 1.35, 0) + 8)
}

/** stacked 一条课程：课程名 -教师 [课序号] / 周次 地点 */
function stackedLines(it, { withWeeks = true, isHit = false, dim = false, onColor = false } = {}) {
  const nameSize = F_NAME
  const metaSize = F_META
  if (it.masked) {
    const label = ['其他教师课程', withWeeks ? maskWeeksText(it) : ''].filter(Boolean).join(' ')
    return [line(run(label, font(metaSize, { color: onColor ? 'ffffff' : SEC_TEXT, bold: true })))]
  }
  if (it.mark) {
    const labelColor = onColor ? 'ffffff' : (it.color || 'ffffff').replace('#', '')
    const out = [line(run(it.label || '', font(metaSize, { color: labelColor, bold: true })))]
    // 外部课表导入的「其他」标注：补课程名 / 课号 [课序号] 行，与页面简表一致
    if (it.source === 'import' && it.course_name) {
      const code = it.course_code
        ? ` ${it.course_code}${it.section_no ? ` [${it.section_no}]` : ''}`
        : ''
      out.push(line(run(it.course_name + code, font(nameSize, { color: labelColor, bold: true }))))
    }
    const meta = [it.weeks_text, it.location, it.remark].filter(Boolean).join(' ')
    if (meta) out.push(line(run(meta, font(metaSize, { color: onColor ? 'ffffff' : META_TEXT }))))
    return out
  }
  const solid = taskColor(it.task_id).solid.replace('#', '')
  const nameColor = onColor ? 'ffffff' : (dim ? DIM_TEXT : solid)
  const teachers = it.teachers || teacherText(it)
  const nameRuns = []
  if (isHit && !onColor) nameRuns.push(run('▌', font(nameSize, { color: solid, bold: true })))
  nameRuns.push(run(
    (it.course_name || '') + (teachers ? ` -${teachers}` : ''),
    font(nameSize, { color: nameColor, bold: true })
  ))
  if (it.section_no) nameRuns.push(run(` [${it.section_no}]`, font(nameSize, { color: onColor ? 'ffffff' : SEC_TEXT })))
  const metaRuns = []
  if (withWeeks && it.weeks_text) metaRuns.push(run(`${it.weeks_text} `, font(metaSize, { color: onColor ? 'ffffff' : (dim ? DIM_TEXT : META_TEXT) })))
  const loc = it.location || slotLocation(it)
  metaRuns.push(run(loc || '未设置地点', font(metaSize, { color: onColor ? 'ffffff' : (loc ? (dim ? DIM_TEXT : META_TEXT) : NOLOC_TEXT) })))
  return [line(...nameRuns), line(...metaRuns)]
}

/** 节次列：节次 + 时间（+ 课时） */
function periodLines(p, showHours) {
  const out = [line(run(p.label || `第${p.period}节`, font(F_PERIOD, { bold: true })))]
  if (p.start || p.end) out.push(line(run(`${p.start || ''}-${p.end || ''}`, font(F_PERIOD_SUB, { color: META_TEXT }))))
  if (showHours) {
    const hours = p.hours != null ? p.hours : (Number(p.period) <= 6 ? 2 : 1)
    out.push(line(run(`${hours}课时`, font(F_PERIOD_SUB, { color: BRAND, bold: true }))))
  }
  return out
}

// ---------------------------------------------------------------------------
// 工作簿渲染
// ---------------------------------------------------------------------------

function writeCell(ws, r, c, lines, { bg, border, align = 'left' }) {
  const cell = ws.getCell(r, c)
  const { richText } = richTextOf(lines)
  cell.value = richText.length ? { richText } : null
  cell.fill = fill(bg)
  cell.border = boxBorder(border)
  cell.alignment = { vertical: 'top', horizontal: align, wrapText: true }
  return heightOf(lines)
}

/** 跨列合并的标题行 */
function mergedRow(ws, r, colCount, text, { bg, color, size, bold = true, align = 'center', height }) {
  ws.mergeCells(r, 1, r, colCount)
  for (let c = 1; c <= colCount; c++) {
    const cell = ws.getCell(r, c)
    cell.fill = fill(bg)
    cell.border = boxBorder(bg === BRAND ? BRAND : BORDER)
  }
  const cell = ws.getCell(r, 1)
  cell.value = text
  cell.font = font(size, { color, bold })
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false }
  ws.getRow(r).height = height
}

/**
 * 渲染一个「节次 × 星期」网格区块（不含标题/表头），返回下一可用行号。
 * keyBy: band 按真实节次取格（合并行扫区间），row 按显示行序号取格。
 */
function renderGrid(ws, startRow, {
  timeslots, days, grid, hi, dayOffset, keyBy, showHours, withWeeks = true
}) {
  const periods = [...timeslots].sort((a, b) => a.period - b.period)
  const searching = hi.size > 0
  let r = startRow
  for (const p of periods) {
    const startPeriod = Number(p.periodStart ?? p.period)
    const endPeriod = Number(p.periodEnd ?? p.period)
    const keys = []
    if (keyBy === 'row') keys.push(p.period)
    else for (let n = startPeriod; n <= endPeriod; n++) keys.push(n)

    let height = writeCell(ws, r, 1, periodLines(p, showHours), {
      bg: HEAD_BG, border: BORDER, align: 'center'
    })
    // 节次列垂直居中更贴近页面观感
    ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

    for (let di = 0; di < days.length; di++) {
      const arr = []
      for (const n of keys) arr.push(...(grid[`${di + 1 + dayOffset}-${n}`] || []))
      const c = di + 2
      if (!arr.length) {
        writeCell(ws, r, c, [], { bg: 'ffffff', border: BORDER })
        continue
      }
      const hitItems = searching ? arr.filter((it) => hi.has(Number(it.task_id))) : []
      const hitSolid = hitItems.length ? taskColor(hitItems[0].task_id).solid : ''
      const markItem = arr.find((it) => it.mark)
      const markColor = markItem ? String(markItem.color || '').replace('#', '') : ''
      const onColor = !!markColor
      const allMasked = arr.every((it) => it.masked)
      // 格底色优先级：标注实色 > 命中浅底 > 他人课程灰底 > 白底
      const bg = markColor ||
        (hitSolid ? mixWithWhite(hitSolid, STACK_HIT_MIX) : '') ||
        (allMasked ? MASK_BG : 'ffffff')
      const border = markColor || hitSolid || BORDER
      // 同格多门课：逐条列出，条目间空一小行
      const lines = []
      arr.forEach((it, i) => {
        if (i) lines.push(line(run(' ', font(5))))
        lines.push(...stackedLines(it, {
          withWeeks,
          isHit: hi.has(Number(it.task_id)),
          dim: searching && !hi.has(Number(it.task_id)),
          onColor
        }))
      })
      height = Math.max(height, writeCell(ws, r, c, lines, { bg, border }))
    }
    ws.getRow(r).height = height
    r++
  }
  return r
}

/**
 * 往工作簿里写一张「节次 × 星期」课表工作表（标题 + 表头 + 区块）。
 * sections: [{ label, grid, keyBy }] —— 简版单区块；分周多区块（每周一个分组行）。
 */
function writeTimetableSheet(wb, sheetName, {
  title, timeslots = [], days = [], dayOffset = 0, highlightTaskIds = [],
  showHours = false, sections = [], perWeekPage = false
}) {
  const colCount = days.length + 1
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2, topLeftCell: 'B3', activeCell: 'B3' }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: perWeekPage ? 0 : 1,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    }
  })
  if (perWeekPage) ws.pageSetup.printTitlesRow = '1:2'

  // 列宽：节次列固定，星期列按列数自适应（整表约 A4 横向一页宽）
  const dayWidth = Math.min(48, Math.max(20, Math.floor(98 / Math.max(days.length, 1))))
  ws.getColumn(1).width = 12
  for (let c = 2; c <= colCount; c++) ws.getColumn(c).width = dayWidth

  const hi = hitSet(highlightTaskIds)
  mergedRow(ws, 1, colCount, title, { bg: BRAND, color: 'ffffff', size: F_TITLE, height: 32 })
  // 表头行
  const headCells = ['节次', ...days]
  headCells.forEach((text, i) => {
    const cell = ws.getCell(2, i + 1)
    cell.value = text
    cell.fill = fill(HEAD_BG)
    cell.border = boxBorder(BORDER)
    cell.font = font(F_HEAD, { bold: true })
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.getRow(2).height = 22

  let r = 3
  sections.forEach((sec, si) => {
    if (sec.label) {
      // 打印时每周从新页开始：分页符加在分组行的前一行（首周紧跟表头，不用分页）
      if (perWeekPage && si > 0) ws.getRow(r - 1).addPageBreak()
      mergedRow(ws, r, colCount, sec.label, {
        bg: WEEK_BG, color: BRAND, size: F_WEEK, align: 'left', height: 24
      })
      r++
    }
    r = renderGrid(ws, r, {
      timeslots, days, grid: sec.grid || {}, hi, dayOffset,
      keyBy: sec.keyBy || 'band', showHours,
      withWeeks: sec.withWeeks !== false
    })
  })
  return ws
}

/** 生成单工作表课表工作簿 buffer */
async function buildXlsxBuffer(opts) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = '研究生排课管理系统'
  writeTimetableSheet(wb, '课表', opts)
  return wb.xlsx.writeBuffer()
}

/**
 * 多工作表工作簿 buffer：sheets 每项一张工作表（name + 与 buildXlsxBuffer 相同参数），
 * 供「我的课表」一个班级一张表聚合进单个 .xlsx；重名表自动加(2)、(3)。
 */
export async function multiSheetXlsxBuffer(sheets) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = '研究生排课管理系统'
  const used = new Set()
  for (const spec of sheets || []) {
    let name = safeSheetName(spec.name)
    for (let i = 2; used.has(name); i++) name = safeSheetName(`${spec.name}(${i})`)
    used.add(name)
    // 与 compactXlsxBuffer 同口径：grid 包成单区块 sections（keyBy 默认显示行）
    writeTimetableSheet(wb, name, {
      ...spec,
      sections: spec.sections || [{ grid: spec.grid || {}, keyBy: spec.keyBy || 'row' }]
    })
  }
  return wb.xlsx.writeBuffer()
}

// ---------------------------------------------------------------------------
// 对外导出入口
// ---------------------------------------------------------------------------

/**
 * 简版课表 buffer：全部周次压缩为一张表（供单份下载与批量 zip 共用）。
 * @param {object} data { timeslots, days, grid, highlightTaskIds, dayOffset, title }
 *   grid 键为「星期-显示行」，条目含 course_name / teachers / weeks_text / location / task_id，
 *   也可含 buildCompactModel 产出的标注条目（mark: true）
 */
export function compactXlsxBuffer(data) {
  return buildXlsxBuffer({
    title: String(data.title || '课表'),
    timeslots: data.timeslots,
    days: data.days,
    dayOffset: data.dayOffset || 0,
    highlightTaskIds: data.highlightTaskIds,
    showHours: false,
    sections: [{ grid: data.grid || {}, keyBy: 'row' }]
  })
}

/** 简版课表单份下载 */
export async function exportCompactXlsx(filename, data) {
  const name = String(data?.title || filename || '课表')
  const buffer = await compactXlsxBuffer({ ...data, title: name })
  downloadXlsxBuffer(name, buffer)
}

/**
 * 分周课表：单表纵向排列，每周一个「第 N 周」分组行；
 * 冻结标题表头，打印时每周从新页开始并重复标题表头。
 * @param {object} data { timeslots, days, weeks:[{week, slots, marks}], highlightTaskIds, dayOffset, title }
 */
export async function exportWeeksXlsx(filename, data) {
  const name = String(data.title || filename || '课表')
  const buffer = await buildXlsxBuffer({
    title: name,
    timeslots: data.timeslots,
    days: data.days,
    dayOffset: data.dayOffset || 0,
    highlightTaskIds: data.highlightTaskIds,
    showHours: true,
    perWeekPage: true,
    // 分周视图里周次已由分组行体现，格内不再重复周次
    sections: (data.weeks || []).map((w) => ({
      label: `第 ${w.week} 周`,
      grid: withMarks(buildGrid(w.slots), w.marks),
      keyBy: 'band',
      withWeeks: false
    }))
  })
  downloadXlsxBuffer(name, buffer)
}