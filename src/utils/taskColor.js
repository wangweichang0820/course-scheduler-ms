// 教学任务色块：用 task_id 稳定映射到一组高对比度颜色，
// 这样同一门课在班级 / 教师 / 教室 / 学生课表里都显示同一种颜色，便于肉眼追踪。

const PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777',
  '#0891b2', '#ca8a04', '#059669', '#e11d48', '#4f46e5', '#0d9488',
  '#ea580c', '#9333ea', '#0284c7', '#65a30d'
]

function hashId(id) {
  const s = String(id ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 由教学任务 id 生成稳定的配色：solid 实色（边框/标识）、bg 浅色底、bgStrong 高亮底色、text 文字色 */
export function taskColor(taskId) {
  const solid = PALETTE[hashId(taskId) % PALETTE.length]
  return {
    solid,
    bg: hexToRgba(solid, 0.16),
    // 高亮（检索命中）用更饱和的底色，一眼能看出被标注的卡片
    bgStrong: hexToRgba(solid, 0.30),
    border: solid,
    text: solid
  }
}

/**
 * 判断一条排课记录是否匹配检索关键词（课程名 / 课序号 / 教学任务名 / 教师 / 班级 / 课程号）。
 * 命中返回 true。
 */
export function slotMatches(slot, keyword) {
  if (!keyword) return false
  const kw = String(keyword).trim().toLowerCase()
  if (!kw) return false
  const hay = [
    slot.course_name,
    slot.course_code,
    slot.section_no,
    slot.task_name,
    slot.teacher_name,
    slot.teacher_names,
    slot.class_name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(kw)
}
