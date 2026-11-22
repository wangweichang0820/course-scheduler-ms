// 排课单自动命名共用工具：新建（SheetFormDialog）与复制（SheetCopyDialog）都用同一套规则，
// 保证名称始终跟随「学期 + 目标班级」，杜绝名称与绑定班级错位（如名称二班、实际绑一班）。
//
// 规则：`学年-学期序号 + 空格 + 学习方式 + 班级名`，秋季记 1 / 春季记 2 / 夏季记 3，
// 与教务导出编码一致；同一班级下重名时才补「-2」「-3」顺延。

// 季节 → 学期序号：与后端 SEASON_TERM_NO 保持一致（改一处要同步）
export const SEASON_TERM_NO = { 秋季: 1, 春季: 2, 夏季: 3 }

/** 学期标识 → 「学年-学期序号」：`2026-2027 春季` → `2026-2027-2` */
export function semesterTermCode(sem) {
  const text = String(sem || '').trim()
  if (!text) return ''
  const matched = text.match(/^(\d{4}-\d{4})[\s-]*(.*)$/)
  if (!matched) return text.replace(/\s+/g, '')
  const [, year, rest] = matched
  const season = rest.trim()
  if (!season) return year
  // 已经写成 `2026-2027-2` 或 `2026-2027 2` 的直接沿用
  if (/^[123]$/.test(season)) return `${year}-${season}`
  const no = SEASON_TERM_NO[season] || SEASON_TERM_NO[`${season[0]}季`]
  return no ? `${year}-${no}` : text.replace(/\s+/g, '')
}

/**
 * 名称主体：`学期编号 + 空格 + 学习方式 + 班级名`。
 * 班级选项优先取 study_mode/name；缺失时回退解析「年级-学习方式-班级名」标签。
 * @param {string} semester 学期标识
 * @param {{study_mode?:string,name?:string,label?:string}} opt 目标班级选项
 */
export function sheetNameBase(semester, opt = {}) {
  const term = semesterTermCode(semester)
  let mode = opt.study_mode || ''
  let cname = opt.name || ''
  if (!cname) {
    const parts = String(opt.label || '').split('-')
    if (parts.length >= 3) {
      if (!mode) mode = parts[1]
      cname = parts.slice(2).join('-')
    }
  }
  return `${term} ${mode}${cname}`.trim()
}

/**
 * 同一班级下生成不重复名：无冲突直接用 base；
 * 已存在 base 或一批 base-2/-3 顺延名时补「-(已用数+1)」。
 * @param {string} base 名称主体
 * @param {string[]|Set<string>} names 该班级下已有排课单名称
 */
export function uniqueSheetName(base, names = []) {
  const list = Array.isArray(names) ? names : [...names]
  const used = list.filter((n) => n === base || n.startsWith(`${base}-`)).length
  return used ? `${base}-${used + 1}` : base
}