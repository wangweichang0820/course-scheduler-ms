/**
 * 批量导出班级课表：每个班级一份 .xlsx 简表，打包成一个 zip 下载。
 *
 * 与页面上「我的课表」的每张卡片完全一致 —— 都走 buildCompactModel + compactXlsxBuffer，
 * 保证「看到 = 导到」：同样的星期列、同样的合并节次行、同格同地点的周次合并，
 * 管理员在该班任课老师时段上叠的「本科课程」等标注色块也一并跟出去。
 *
 * 数据来源是 api.schedClassTimetables（后端按班级分组一次返回）：
 * 管理员视角拿到全部班级的完整明细；教师视角（本人有课的班级 + masked）
 * 只在页面上展示，不做批量导出。
 */
import JSZip from 'jszip'
import { buildCompactModel } from '@/utils/compactGrid'
import { compactXlsxBuffer, multiSheetXlsxBuffer, downloadXlsxBuffer, safeFileName } from '@/utils/exportTimetable'
import { teacherIdsOfItems } from '@/utils/teacherMarks'

/**
 * 某个班级卡片可见的标注：卡片里出现过的老师的标注（遮盖记录不含教师 id，天然过滤掉他人）。
 * 与 MyScheduleView.marksOf 同一口径，保证页面看到 = 导出的表格。
 */
function marksForClass(cls, allMarks) {
  const ids = new Set(teacherIdsOfItems(cls?.items))
  return (allMarks || []).filter((m) => ids.has(Number(m.teacher_id)))
}

/**
 * 一个班级简表的规格（模型 + 标题 + 文件名），单份下载 / zip / 多表聚合共用。
 * @param {object} data { cls, semester, timeslots, days, marks }
 *   cls 是 api.schedClassTimetables 返回的一项；marks 是本学期全量原始标注（内部按班级老师筛选）
 */
function classCompactSpec({ cls, semester, timeslots, days, marks = [] }) {
  const own = marksForClass(cls, marks)
  const model = buildCompactModel({
    items: cls.items || [],
    timeslots,
    days,
    // 每个班级用自己的班型决定星期列与合并行；缺班型时铺满一周，与页面回退口径一致
    classForm: cls.class_form || '',
    marks: own
  })
  const label = cls.class_label || cls.class_name || '未命名班级'
  return {
    label,
    title: `${semester} · ${label} 课表简表`,
    fileName: safeFileName(`${semester}-${label}课表`),
    model,
    markCount: own.length
  }
}

/** 一个班级简表 xlsx buffer */
export async function classCompactXlsx(data) {
  const spec = classCompactSpec(data)
  return {
    ...spec,
    buffer: await compactXlsxBuffer({
      timeslots: spec.model.timeslots,
      days: spec.model.visibleDays,
      grid: spec.model.grid,
      dayOffset: spec.model.dayOffset,
      title: spec.title
    })
  }
}

/**
 * 生成 zip：每个班级一份 .xlsx，同名班级（重名 / 同名不同 id）自动加(2)、(3)防覆盖。
 * @param {object} data { semester, classes, timeslots, days, marks }
 * @returns {Promise<{blob: Blob, fileName: string, count: number}>}
 */
export async function buildClassTimetableZip({
  semester, classes = [], timeslots = [], days = [], marks = []
}) {
  const zip = new JSZip()
  const used = new Set()
  for (const cls of classes) {
    const { fileName, buffer } = await classCompactXlsx({ cls, semester, timeslots, days, marks })
    let name = `${fileName}.xlsx`
    for (let i = 2; used.has(name); i++) name = `${fileName}(${i}).xlsx`
    used.add(name)
    zip.file(name, buffer)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return {
    blob,
    fileName: `${safeFileName(`${semester}-班级课表`)}.zip`,
    count: classes.length
  }
}

/**
 * 单个班级直接下载一份 .xlsx 简表（不打包），供班级卡片上的「导出简表」按钮用。
 */
export async function downloadClassCompact({ cls, semester, timeslots, days, marks = [] }) {
  const { fileName, buffer } = await classCompactXlsx({ cls, semester, timeslots, days, marks })
  downloadXlsxBuffer(fileName, buffer)
}

/**
 * 教师「我的课表」导出：当前页面全部班级聚合进单个 .xlsx，一个班级一张工作表；
 * 有周次标注时首张表为「我的标注课程」（与页面顶部独立表一致）。
 * 看到 = 导到：与页面卡片同一份简表模型（他人课程仍为遮盖色块，不含课程与教师信息）；
 * 标注只在首张独立表显示，班级工作表不叠加（与页面口径一致）。
 * @param {object} data { semester, teacherName, classes, timeslots, days, marks }
 * @returns {Promise<{buffer: ArrayBuffer, fileName: string, count: number}>}
 */
export async function buildMyScheduleXlsx({
  semester, teacherName = '', classes = [], timeslots = [], days = [], marks = []
}) {
  const sheets = []
  if (marks.length) {
    const model = buildCompactModel({ items: [], timeslots, days, classForm: '', marks })
    sheets.push({
      name: '我的标注课程',
      title: `${semester} · 我的标注课程`,
      timeslots: model.timeslots,
      days: model.visibleDays,
      grid: model.grid,
      dayOffset: model.dayOffset
    })
  }
  for (const cls of classes) {
    // 班级表不叠加标注：标注仅在首张「我的标注课程」表显示
    const { label, title, model } = classCompactSpec({ cls, semester, timeslots, days, marks: [] })
    sheets.push({
      name: label,
      title,
      timeslots: model.timeslots,
      days: model.visibleDays,
      grid: model.grid,
      dayOffset: model.dayOffset
    })
  }
  const buffer = await multiSheetXlsxBuffer(sheets)
  return {
    buffer,
    fileName: safeFileName(`${semester}-我的课表${teacherName ? `-${teacherName}` : ''}`),
    count: classes.length
  }
}

/** 教师「我的课表」单文件下载 */
export async function downloadMyScheduleXlsx(data) {
  const { fileName, buffer } = await buildMyScheduleXlsx(data)
  downloadXlsxBuffer(fileName, buffer)
}
