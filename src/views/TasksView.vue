<template>
  <div class="tasks">
    <div class="toolbar">
      <el-radio-group v-model="filterForm" size="default">
        <el-radio-button value="">全部班型</el-radio-button>
        <el-radio-button value="全日制">全日制</el-radio-button>
        <el-radio-button value="非全日制周末班">非全周末</el-radio-button>
        <el-radio-button value="非全日制集中班">非全集中</el-radio-button>
      </el-radio-group>
      <el-input v-model="kw" placeholder="搜索课程 / 教师 / 班级" clearable class="ctrl" style="--ctrl-w: 260px" :prefix-icon="Search" />
      <div class="spacer"></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增任务</el-button>
      <el-button :disabled="!selection.length" @click="bulkDelete">批量删除（{{ selection.length }}）</el-button>
    </div>

    <!-- 表高随视口走：写死 620 时高分屏下方会空出一大片 -->
    <el-table :data="rows" size="small" border stripe @selection-change="selection = $event" :max-height="tableMax">
      <el-table-column type="selection" width="42" />
      <el-table-column label="课程 / 课序号" min-width="240">
        <template #default="{ row }">
          <div class="task-name">
            <b>{{ courseName(row.course_id) }}</b>
            <el-tag size="small" type="info" effect="plain">{{ row.section_no }}</el-tag>
          </div>
          <div class="task-sub">{{ row.task_name }}</div>
        </template>
      </el-table-column>
      <el-table-column label="班级" width="180">
        <template #default="{ row }">
          <div>{{ classNames(row.class_ids || (row.class_id ? [row.class_id] : [])).join('、') || '—' }}</div>
          <el-tag v-if="(row.class_ids || []).length > 1" size="small" type="warning" style="margin-top: 2px">合班</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="教师" width="140">
        <template #default="{ row }">{{ teacherName(row.teacher_id) }}{{ row.teacher2_id ? ' / ' + teacherName(row.teacher2_id) : '' }}</template>
      </el-table-column>
      <el-table-column label="班型" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="tagType(row.class_form)">{{ shortForm(row.class_form) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="周次" width="150">
        <template #default="{ row }">{{ weeksText(row.week_pattern) }}</template>
      </el-table-column>
      <el-table-column label="课时" width="120">
        <template #default="{ row }">
          <span :class="progressClass(row)">{{ scheduled(row) }}/{{ row.total_hours }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除？" @confirm="onDelete(row)">
            <template #reference><el-button link type="danger" size="small">删除</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="720px" destroy-on-close>
      <el-form :model="dialog.form" label-width="110px">
        <el-form-item label="课程" required>
          <el-select v-model="dialog.form.course_id" filterable placeholder="选择课程" style="width: 100%">
            <el-option v-for="c in store.courses" :key="c.id" :label="`${c.name} (${c.code})`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="课序号">
          <el-input v-model="dialog.form.section_no" placeholder="01 / 81 / 91 ..." />
        </el-form-item>
        <el-form-item label="学期">
          <el-select v-model="dialog.form.semester" style="width: 100%">
            <el-option v-for="s in store.semesters" :key="s.code" :label="s.code" :value="s.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="开课班级">
          <el-select v-model="dialog.form.class_ids" multiple filterable style="width: 100%" @change="onClassChange">
            <el-option v-for="c in store.classRooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="授课形式">
          <el-radio-group v-model="dialog.form.class_form">
            <el-radio value="全日制">全日制</el-radio>
            <el-radio value="非全日制周末班">非全周末</el-radio>
            <el-radio value="非全日制集中班">非全集中</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="主讲教师">
          <el-select v-model="dialog.form.teacher_id" filterable clearable style="width: 100%">
            <el-option v-for="t in store.teachers" :key="t.id" :label="`${t.name}（${t.title}）`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="第二位教师">
          <el-select v-model="dialog.form.teacher2_id" filterable clearable style="width: 100%">
            <el-option v-for="t in store.teachers" :key="t.id" :label="`${t.name}（${t.title}）`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="总课时">
          <el-input-number v-model="dialog.form.total_hours" :min="0" :step="8" />
        </el-form-item>
        <el-form-item label="周课时">
          <el-input-number v-model="dialog.form.weekly_hours" :min="0" :step="2" />
        </el-form-item>
        <el-form-item label="每周次数">
          <el-input-number v-model="dialog.form.sessions_per_week" :min="1" :max="6" />
        </el-form-item>
        <el-form-item label="每次节数">
          <el-input-number v-model="dialog.form.periods_per_session" :min="1" :max="4" />
        </el-form-item>
        <el-form-item label="周次">
          <WeekPicker v-model="dialog.form.week_pattern" :total="store.totalWeeks" />
        </el-form-item>
        <el-form-item label="考核方式">
          <el-select v-model="dialog.form.exam_type">
            <el-option label="考试" value="考试" />
            <el-option label="考查" value="考查" />
            <el-option label="作业考察" value="作业考察" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useDataStore } from '@/stores/data'
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'
import WeekPicker from '@/components/WeekPicker.vue'
import { patternToWeeks, weeksToText } from '@/utils/weeks'

const store = useDataStore()
const kw = ref('')
// 占用高度：页头 60 + 上下内边距 36 + 工具条 56 + 余量
const tableMax = useTableMaxHeight(220)
const filterForm = ref('')
const selection = ref([])

function weeksText(p) { return weeksToText(patternToWeeks(p), { prefix: '第', unit: '周' }) || '—' }
function courseName(id) { return store.courseMap.get(Number(id))?.name || '—' }
function teacherName(id) { return store.teacherMap.get(Number(id))?.name || '—' }
function classNames(ids) { return (ids || []).map((i) => store.classMap.get(Number(i))?.name).filter(Boolean) }
function shortForm(f) { return (f || '').replace('非全日制', '') || '—' }
function tagType(f) {
  if (f === '全日制') return 'success'
  if (f === '非全日制周末班') return 'warning'
  if (f === '非全日制集中班') return ''
  return 'info'
}
function scheduled(task) {
  const slots = store.scheduleSlots.filter((s) => Number(s.task_id) === Number(task.id))
  const seen = new Set()
  let h = 0
  for (const s of slots) {
    const k = `${s.day_of_week}|${s.start_period}|${s.end_period}|${s.week_pattern}`
    if (seen.has(k)) continue
    seen.add(k)
    h += patternToWeeks(s.week_pattern).length * (Number(s.end_period || s.start_period) - Number(s.start_period) + 1) * 2
  }
  return h
}
function progressClass(task) {
  const done = scheduled(task); const plan = Number(task.total_hours || 0)
  if (!plan) return ''
  if (done > plan) return 'over'
  if (done < plan) return 'under'
  return 'ok'
}
function statusType(s) {
  if (s === '已排完' || s === '已发布') return 'success'
  if (s === '部分已排') return 'warning'
  return 'info'
}
function refreshStatus(task) {
  const done = scheduled(task); const plan = Number(task.total_hours || 0)
  if (!plan) return
  return done === 0 ? '待排' : (done >= plan ? '已排完' : '部分已排')
}

const rows = computed(() => {
  const k = kw.value.trim().toLowerCase()
  return store.teachingTasks.filter((t) => {
    if (store.currentSemester && t.semester !== store.currentSemester) return false
    if (filterForm.value && t.class_form !== filterForm.value) return false
    if (!k) return true
    return (t.task_name || '').toLowerCase().includes(k) ||
      courseName(t.course_id).toLowerCase().includes(k) ||
      teacherName(t.teacher_id).toLowerCase().includes(k) ||
      classNames(t.class_ids).join(' ').toLowerCase().includes(k)
  })
})

const dialog = reactive({ visible: false, title: '', mode: 'create', form: {} })

function openCreate() {
  dialog.mode = 'create'
  dialog.form = {
    semester: store.currentSemester, section_no: '', class_ids: [],
    total_hours: 32, weekly_hours: 2, sessions_per_week: 1, periods_per_session: 2,
    week_pattern: '1'.repeat(store.totalWeeks), exam_type: '考试',
    class_form: '全日制', status: '待排', capacity: 60, restriction: ''
  }
  dialog.title = '新增教学任务'
  dialog.visible = true
}
function openEdit(row) {
  dialog.mode = 'edit'
  dialog.form = { ...row, class_ids: row.class_ids || (row.class_id ? [row.class_id] : []) }
  dialog.title = '编辑教学任务'
  dialog.visible = true
}
function onClassChange(ids) {
  if (ids?.length) {
    const cls = store.classMap.get(Number(ids[0]))
    if (cls) dialog.form.class_form = cls.class_form
  }
}
async function save() {
  const f = dialog.form
  if (!f.course_id) return ElMessage.warning('请选择课程')
  f.class_id = f.class_ids?.[0] || null
  // dialog.form 是 reactive 对象，class_ids / teacher_ids 等数组是 Proxy，
  // IndexedDB 无法结构化克隆，必须在落盘前转成普通数据。
  const task = JSON.parse(JSON.stringify(f))
  try {
    if (dialog.mode === 'create') await store.create('teachingTasks', task)
    else await store.update('teachingTasks', task.id, task)
    // 状态自动回填
    const savedId = task.id || Math.max(...store.teachingTasks.map((t) => t.id))
    const saved = store.teachingTasks.find((x) => x.id === savedId)
    if (saved) {
      const s = refreshStatus(saved)
      if (s && s !== saved.status) await store.update('teachingTasks', saved.id, { status: s })
    }
    ElMessage.success('已保存')
    dialog.visible = false
  } catch (e) {
    console.error(e)
    ElMessage.error('保存失败：' + (e?.message || e))
  }
}
async function onDelete(row) {
  await store.remove('teachingTasks', row.id)
  ElMessage.success('已删除')
}
async function bulkDelete() {
  await store.bulkRemove('teachingTasks', selection.value.map((x) => x.id))
  ElMessage.success(`已删除 ${selection.value.length} 条`)
  selection.value = []
}
</script>

<style scoped>
/* 版心居中：宽屏下限宽后若仍左对齐，剩余宽度会全部堆到右侧，看着像页面没铺满 */
.tasks { max-width: 1280px; margin-inline: auto; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.spacer { flex: 1; }
.task-name { display: flex; align-items: center; gap: 6px; }
.task-sub { font-size: 11px; color: #8a94a6; margin-top: 2px; }
.over { color: #dc2626; font-weight: 600; }
.under { color: #f59e0b; }
.ok { color: #16a34a; }
</style>
