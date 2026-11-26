/**
 * 教师扩展演示资料。
 *
 * 原始脱敏数据只保留了工号、姓名、职称等少量字段，学院、办公室、邮箱等为空。
 * 这里提供确定性的演示值，用于把教师详情页补全；不覆盖用户已经填写的内容。
 */

export const TEACHER_PROFILE_VERSION = 'demo-v1'

const DEPARTMENTS = [
  '工程管理系',
  '物流工程系',
  '信息管理系',
  '交通运输系',
  '土木工程系',
  '机电工程系',
  '经济管理系',
  'MEM 教育中心'
]

const OFFICE_BUILDINGS = ['教学楼 A', '教学楼 B', '科研楼', '创新中心']
const FALLBACK_TITLES = ['讲师', '副教授', '教授']

export function withTeacherProfile(teacher, index = 0) {
  const title = teacher.title || FALLBACK_TITLES[index % FALLBACK_TITLES.length]
  const teacherNo = String(teacher.teacher_no || teacher.id || index + 1).toLowerCase()
  const building = OFFICE_BUILDINGS[index % OFFICE_BUILDINGS.length]
  const room = 202 + (index % 5) * 10 + (index % 3)

  return {
    ...teacher,
    gender: teacher.gender || (index % 2 === 0 ? '男' : '女'),
    title,
    department: teacher.department || DEPARTMENTS[index % DEPARTMENTS.length],
    office: teacher.office || `${building}-${room}`,
    roles: teacher.roles || (Number(teacher.is_mentor) ? '导师 / 任课教师' : '任课教师'),
    email: teacher.email || `teacher${teacherNo}@example.com`,
    max_students: teacher.max_students ?? (title === '教授' ? 12 : title === '副教授' ? 10 : 8)
  }
}

/**
 * 非破坏性补齐旧 IndexedDB：只写缺失字段，保留用户已有修改和排课结果。
 */
export async function ensureTeacherProfiles(db) {
  const flag = await db.meta.get('teacherProfiles')
  if (flag?.value === TEACHER_PROFILE_VERSION) return false

  const teachers = await db.teachers.toArray()
  await db.transaction('rw', db.teachers, db.meta, async () => {
    for (let index = 0; index < teachers.length; index += 1) {
      const current = teachers[index]
      const profile = withTeacherProfile(current, index)
      const patch = {}
      for (const key of ['gender', 'title', 'department', 'office', 'roles', 'email', 'max_students']) {
        if (current[key] === undefined || current[key] === null || current[key] === '') {
          patch[key] = profile[key]
        }
      }
      if (Object.keys(patch).length) await db.teachers.update(current.id, patch)
    }
    await db.meta.put({ key: 'teacherProfiles', value: TEACHER_PROFILE_VERSION, at: Date.now() })
  })
  return true
}
