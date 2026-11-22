/**
 * 批量导出教师课表简表：每位老师一个 .xlsx，打包成一个 zip 下载。
 *
 * 表格与页面上的「教师课表」完全一致 —— 都走 buildCompactModel + compactXlsxBuffer，
 * 包括管理员标注的「本科课程」等色块（简表里带周次与备注）。
 */
import JSZip from 'jszip'
import { buildCompactModel } from '@/utils/compactGrid'
import { compactXlsxBuffer, safeFileName } from '@/utils/exportTimetable'

/** 一位老师的简表 xlsx（含标注）；教师课表统一铺满 7 天、节次不合并，与标注管理弹窗一致 */
export async function teacherCompactXlsx({ teacher, semester, timeslots, days, marks = [] }) {
  const own = marks.filter((m) => Number(m.teacher_id) === Number(teacher.teacher_id))
  const model = buildCompactModel({
    items: teacher.items || [],
    timeslots,
    days,
    marks: own
  })
  const title = `${semester} · ${teacher.teacher_name} 课表简表`
  return {
    title,
    fileName: safeFileName(`${semester}-${teacher.teacher_name}课表`),
    buffer: await compactXlsxBuffer({
      timeslots: model.timeslots,
      days: model.visibleDays,
      grid: model.grid,
      dayOffset: model.dayOffset,
      title
    }),
    // 页面里的同一份模型：渲染简表卡片也用它，保证看到 = 导到
    model,
    markCount: own.length
  }
}

/**
 * 生成 zip。
 * @param {object} data { semester, teachers, timeslots, days, marks }
 * @returns {Promise<{blob: Blob, fileName: string, count: number}>}
 */
export async function buildTeacherTimetableZip({
  semester, teachers = [], timeslots = [], days = [], marks = []
}) {
  const zip = new JSZip()
  const used = new Set()
  for (const t of teachers) {
    const { fileName, buffer } = await teacherCompactXlsx({
      teacher: t, semester, timeslots, days, marks
    })
    // 同名老师（重名）不互相覆盖
    let name = `${fileName}.xlsx`
    for (let i = 2; used.has(name); i++) name = `${fileName}(${i}).xlsx`
    used.add(name)
    zip.file(name, buffer)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return {
    blob,
    fileName: `${safeFileName(`${semester}-教师课表`)}.zip`,
    count: teachers.length
  }
}
