/**
 * 全局数据 store：一次性把 IndexedDB 里的基础数据全量缓存到内存，
 * 供冲突引擎/体检引擎/视图筛选使用；写操作通过 Dexie 落盘，再回写本 store。
 *
 * 学生 8 班规模（约 100-200 slot）内存全量足够，无需分页。
 */
import { defineStore } from 'pinia'
import { db, ensureSeeded, wipeAll, SEED_VERSION } from '@/db/indexed'
import { seedDemo } from '@/seed/demo-data'
import { ensureTeacherProfiles } from '@/seed/teacher-profiles'

const EMPTY = () => ({
  semesters: [],
  classRooms: [],
  courses: [],
  teachers: [],
  venues: [],
  holidays: [],
  teachingTasks: [],
  scheduleSheets: [],
  scheduleSlots: [],
  weekGroups: [],
  sheetTasks: [],
  currentSemester: '',
  currentClassForm: '',
  ready: false
})

export const useDataStore = defineStore('data', {
  state: EMPTY,

  getters: {
    semesterOptions: (s) => s.semesters.map((x) => ({ value: x.code, label: x.code })),
    // value 用空串表示「不按班型过滤」；Element Plus 默认把空串归为未选中值，
    // 所以页头那个 el-select 必须同时传 :empty-values="[]"，否则这里显示的是「请选择」而不是本行文案
    classFormOptions: () => [
      { value: '', label: '全部形式' },
      { value: '全日制', label: '全日制' },
      { value: '非全日制周末班', label: '非全周末班' },
      { value: '非全日制集中班', label: '非全集中班' }
    ],
    classesByForm: (s) => (form) => form ? s.classRooms.filter((c) => c.class_form === form) : s.classRooms,
    tasksBySemester: (s) => (code, form) => s.teachingTasks.filter((t) =>
      (!code || t.semester === code) && (!form || t.class_form === form)
    ),
    sheetsBySemester: (s) => (code) => s.scheduleSheets.filter((x) => !code || x.semester === code),
    slotsBySheet: (s) => (sheetId) => s.scheduleSlots.filter((x) => Number(x.sheet_id) === Number(sheetId)),
    slotsBySemester: (s) => (code) => s.scheduleSlots.filter((x) => !code || x.semester === code),
    teacherMap: (s) => new Map(s.teachers.map((t) => [Number(t.id), t])),
    classMap: (s) => new Map(s.classRooms.map((c) => [Number(c.id), c])),
    courseMap: (s) => new Map(s.courses.map((c) => [Number(c.id), c])),
    venueMap: (s) => new Map(s.venues.map((v) => [Number(v.id), v])),
    taskMap: (s) => new Map(s.teachingTasks.map((t) => [Number(t.id), t])),
    sheetMap: (s) => new Map(s.scheduleSheets.map((x) => [Number(x.id), x])),
    currentSemesterMeta: (s) => s.semesters.find((x) => x.code === s.currentSemester) || s.semesters[0] || {},
    totalWeeks() { return Number(this.currentSemesterMeta?.weeks || 24) },
    /** 把原始 slot 补上 course_name / teacher_names / section_no / class_name，供 CompactTimetable、导出使用 */
    enrichSlot: (s) => (slot) => {
      const task = s.teachingTasks.find((t) => Number(t.id) === Number(slot.task_id)) || {}
      const course = s.courses.find((c) => Number(c.id) === Number(task.course_id)) || {}
      const teacher = s.teachers.find((t) => Number(t.id) === Number(task.teacher_id)) || {}
      const teacher2 = task.teacher2_id ? s.teachers.find((t) => Number(t.id) === Number(task.teacher2_id)) : null
      const cls = s.classRooms.find((c) => Number(c.id) === Number(slot.class_id ?? task.class_id)) || {}
      const names = [teacher.name, teacher2?.name].filter(Boolean).join('、')
      return {
        ...slot,
        course_name: slot.course_name || course.name || '',
        course_code: slot.course_code || course.code || '',
        section_no: slot.section_no || task.section_no || '',
        teacher_names: slot.teacher_names || names,
        class_name: slot.class_name || cls.name || '',
        class_form: slot.class_form || cls.class_form || task.class_form || '',
        is_merged: !!(task.class_ids && task.class_ids.length > 1)
      }
    }
  },

  actions: {
    async init() {
      await ensureSeeded(seedDemo, SEED_VERSION)
      await ensureTeacherProfiles(db)
      await this.reload()
      // 默认选中当前学期
      const cur = this.semesters.find((s) => s.is_current) || this.semesters[0]
      if (cur) this.currentSemester = cur.code
      this.ready = true
    },

    async reload() {
      this.semesters = await db.semesters.toArray()
      this.classRooms = await db.classRooms.toArray()
      this.courses = await db.courses.toArray()
      this.teachers = await db.teachers.toArray()
      this.venues = await db.venues.toArray()
      this.holidays = await db.holidays.toArray()
      this.teachingTasks = await db.teachingTasks.toArray()
      this.scheduleSheets = await db.scheduleSheets.toArray()
      this.scheduleSlots = await db.scheduleSlots.toArray()
      this.weekGroups = await db.weekGroups.toArray()
      this.sheetTasks = await db.sheetTasks.toArray()
    },

    async resetDemo() {
      await wipeAll()
      await seedDemo(db)
      await ensureTeacherProfiles(db)
      await db.meta.put({ key: 'seeded', value: SEED_VERSION, at: Date.now() })
      await this.reload()
      const cur = this.semesters.find((s) => s.is_current) || this.semesters[0]
      if (cur) this.currentSemester = cur.code
    },

    // ---- 通用 CRUD（entity 对应 Dexie 表名）----
    async list(entity) { return db.table(entity).toArray() },
    async get(entity, id) { return db.table(entity).get(Number(id)) },
    async create(entity, row) {
      const id = await db.table(entity).add(row)
      await this.reload()
      return { id, ...row }
    },
    async update(entity, id, patch) {
      await db.table(entity).update(Number(id), patch)
      await this.reload()
    },
    async remove(entity, id) {
      await db.table(entity).delete(Number(id))
      // 关联清理
      if (entity === 'scheduleSheets') {
        await db.scheduleSlots.where('sheet_id').equals(Number(id)).delete()
      } else if (entity === 'teachingTasks') {
        await db.scheduleSlots.where('task_id').equals(Number(id)).delete()
      } else if (entity === 'classRooms') {
        await db.scheduleSheets.where('class_id').equals(Number(id)).delete()
      }
      await this.reload()
    },
    async bulkRemove(entity, ids) {
      await db.table(entity).bulkDelete(ids.map(Number))
      await this.reload()
    },

    // ---- 排课专用 ----
    async saveSlot(row) {
      if (row.id) {
        await db.scheduleSlots.update(Number(row.id), row)
      } else {
        const id = await db.scheduleSlots.add(row)
        row.id = id
      }
      await this.reload()
      return row
    },
    async deleteSlot(id) {
      await db.scheduleSlots.delete(Number(id))
      await this.reload()
    },
    async bulkSaveSlots(rows) {
      for (const r of rows) {
        if (r.id) await db.scheduleSlots.update(Number(r.id), r)
        else await db.scheduleSlots.add(r)
      }
      await this.reload()
    },
    async clearSheetSlots(sheetId, keepLocked = true) {
      const collection = db.scheduleSlots.where('sheet_id').equals(Number(sheetId))
      const rows = await collection.toArray()
      const toDelete = keepLocked ? rows.filter((r) => !r.locked) : rows
      await db.scheduleSlots.bulkDelete(toDelete.map((r) => r.id))
      await this.reload()
      return toDelete.length
    }
  }
})
