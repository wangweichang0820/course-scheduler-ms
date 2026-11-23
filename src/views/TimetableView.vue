<template>
  <div class="tt-view">
    <div class="toolbar">
      <el-radio-group v-model="mode" size="default">
        <el-radio-button value="class">📚 班级视角</el-radio-button>
        <el-radio-button value="teacher">👤 教师视角</el-radio-button>
      </el-radio-group>

      <template v-if="mode === 'class'">
        <el-select v-model="sheetId" placeholder="选择排课单" class="ctrl" style="--ctrl-w: 280px" filterable>
          <el-option v-for="s in sheets" :key="s.id" :label="s.name" :value="s.id">
            <div class="opt-row">
              <span>{{ s.name }}</span>
              <el-tag size="small" :type="tagType(s.class_form)" effect="plain">{{ shortForm(s.class_form) }}</el-tag>
            </div>
          </el-option>
        </el-select>
      </template>

      <template v-else>
        <el-select v-model="teacherId" placeholder="选择教师" class="ctrl" style="--ctrl-w: 240px" filterable>
          <el-option v-for="t in store.teachers" :key="t.id" :label="`${t.name} · ${t.title || ''}`" :value="t.id" />
        </el-select>
        <el-select v-model="teacherClassForm" placeholder="班型（可留空）" clearable class="ctrl" style="--ctrl-w: 160px">
          <el-option label="全部班型" value="" />
          <el-option label="全日制" value="全日制" />
          <el-option label="非全周末班" value="非全日制周末班" />
          <el-option label="非全集中班" value="非全日制集中班" />
        </el-select>
      </template>

      <div class="spacer"></div>

      <el-button-group>
        <el-button size="default" :type="variant === 'compact' ? 'primary' : 'default'" @click="variant = 'compact'">简版</el-button>
        <el-button size="default" :type="variant === 'stacked' ? 'primary' : 'default'" @click="variant = 'stacked'">逐周</el-button>
      </el-button-group>
      <el-button @click="doExport" :disabled="!items.length">导出 xlsx</el-button>
    </div>

    <div class="meta-bar" v-if="items.length">
      <el-tag effect="plain" size="small">{{ metaTitle }}</el-tag>
      <span class="meta-line">{{ items.length }} 条排课 · {{ courseCount }} 门课程 · 教师 {{ teacherCount }} 位</span>
    </div>

    <el-empty v-if="!items.length" description="当前筛选下没有排课记录" />

    <div v-else class="grid-wrap">
      <!-- 简版：同格周次合并、班型自动裁列 -->
      <div v-if="variant === 'compact'" class="card">
        <CompactTimetable
          :items="items"
          :timeslots="TIMESLOTS"
          :days="DAYS"
          :class-form="classFormForView"
        />
      </div>
      <!-- 逐周：每周单独一张 TimetableGrid（stacked 模式），集中班尤其直观 -->
      <div v-else class="week-list">
        <div v-for="w in weekModel" :key="w.week" class="card week-card">
          <div class="week-title">第 {{ w.week }} 周 · {{ w.slots.length }} 节</div>
          <TimetableGrid
            :timeslots="displayTimeslots"
            :days="visibleDayList"
            :day-offset="dayOffset"
            :slots="w.slots"
            stacked
            :simple="true"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useRoute } from 'vue-router'
import CompactTimetable from '@/components/CompactTimetable.vue'
import TimetableGrid from '@/components/TimetableGrid.vue'
import { TIMESLOTS, DAYS } from '@/seed/demo-data'
import { buildCompactModel, buildWeekModel, visibleDayWindow } from '@/utils/compactGrid'
import { buildDisplayTimeslots } from '@/utils/schedule'
import { compactXlsxBuffer, downloadXlsxBuffer } from '@/utils/exportTimetable'

const store = useDataStore()
const route = useRoute()

const mode = ref(route.query.mode === 'teacher' ? 'teacher' : 'class')
const sheetId = ref(null)
const teacherId = ref(null)
const teacherClassForm = ref('')
const variant = ref('compact')

const sheets = computed(() =>
  store.sheetsBySemester(store.currentSemester)
    .map((s) => ({ ...s, class_form: store.classMap.get(s.class_id)?.class_form || '' }))
)

const currentSheet = computed(() => sheets.value.find((s) => s.id === sheetId.value) || null)

// 排课记录（已补充课程/教师名）
const items = computed(() => {
  if (mode.value === 'class') {
    if (!currentSheet.value) return []
    return store.scheduleSlots
      .filter((s) => Number(s.sheet_id) === Number(currentSheet.value.id))
      .map((s) => store.enrichSlot(s))
  }
  // 教师视角：跨班级/跨排课单，按 task 反查
  if (!teacherId.value) return []
  const tid = Number(teacherId.value)
  const taskIds = new Set(
    store.teachingTasks
      .filter((t) => t.semester === store.currentSemester)
      .filter((t) => Number(t.teacher_id) === tid || Number(t.teacher2_id) === tid)
      .filter((t) => (teacherClassForm.value ? t.class_form === teacherClassForm.value : true))
      .map((t) => Number(t.id))
  )
  return store.scheduleSlots
    .filter((s) => taskIds.has(Number(s.task_id)))
    .map((s) => store.enrichSlot(s))
})

// 视图班型：班级视角固定为所选班级班型；教师视角默认''（全天），若指定筛选则按筛选班型渲染
const classFormForView = computed(() => {
  if (mode.value === 'class') return currentSheet.value?.class_form || ''
  return teacherClassForm.value || ''
})

// 用于逐周模式的显示行、可见星期、偏移
const compactModel = computed(() => buildCompactModel({
  items: items.value,
  timeslots: TIMESLOTS,
  days: DAYS,
  classForm: classFormForView.value,
  marks: []
}))
const displayTimeslots = computed(() =>
  buildDisplayTimeslots(TIMESLOTS, classFormForView.value)
)
const dayWindow = computed(() => visibleDayWindow(DAYS, classFormForView.value))
const visibleDayList = computed(() => dayWindow.value.visibleDays)
const dayOffset = computed(() => dayWindow.value.dayOffset)

// 逐周数据：只保留有课的周
const weekModel = computed(() => buildWeekModel({
  items: items.value,
  marks: [],
  totalWeeks: store.totalWeeks
}))

const courseCount = computed(() => new Set(items.value.map((s) => s.course_name).filter(Boolean)).size)
const teacherCount = computed(() => {
  const set = new Set()
  for (const s of items.value) {
    for (const n of String(s.teacher_names || '').split(/[、,，]/)) {
      if (n.trim()) set.add(n.trim())
    }
  }
  return set.size
})

const metaTitle = computed(() => {
  if (mode.value === 'class') {
    const cls = store.classMap.get(currentSheet.value?.class_id)
    return `${cls?.name || '未选择班级'} · ${store.currentSemester}`
  }
  const t = store.teacherMap.get(Number(teacherId.value))
  return `${t?.name || '未选择教师'} 的学期课表 · ${store.currentSemester}`
})

function shortForm(f) { return (f || '').replace('非全日制', '') || '—' }
function tagType(f) {
  if (f === '全日制') return 'success'
  if (f === '非全日制周末班') return 'warning'
  if (f === '非全日制集中班') return ''
  return 'info'
}

async function doExport() {
  if (!items.value.length) return
  const model = compactModel.value
  const buf = await compactXlsxBuffer({
    ...model,
    days: visibleDayList.value,
    title: metaTitle.value
  })
  downloadXlsxBuffer(metaTitle.value, buf)
  ElMessage.success('已开始下载')
}

// 首次挂载：班级视角默认第一张排课单；教师视角默认第一位教师
onMounted(() => {
  if (!sheetId.value) sheetId.value = sheets.value[0]?.id || null
  if (!teacherId.value) teacherId.value = store.teachers[0]?.id || null
})

watch(mode, (m) => {
  if (m === 'class' && !sheetId.value) sheetId.value = sheets.value[0]?.id || null
  if (m === 'teacher' && !teacherId.value) teacherId.value = store.teachers[0]?.id || null
})

watch(() => store.currentSemester, () => {
  sheetId.value = sheets.value[0]?.id || null
})

// 允许从其它页面 query 参数跳转（?sheet=3 或 ?teacher=5&mode=teacher）
watch(() => route.query, (q) => {
  if (q.sheet) sheetId.value = Number(q.sheet)
  if (q.teacher) { teacherId.value = Number(q.teacher); mode.value = 'teacher' }
}, { immediate: true })
</script>

<style scoped>
/* 版心居中：与其他页保持一致，宽屏下不留单侧空白 */
.tt-view { max-width: 1360px; margin-inline: auto; display: flex; flex-direction: column; gap: 12px; }
.toolbar {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  flex-wrap: wrap;
}
.spacer { flex: 1; }
.opt-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.meta-bar { padding: 0 4px; display: flex; align-items: center; gap: 10px; }
.meta-line { font-size: 12px; color: #6b7280; }
.grid-wrap { display: flex; flex-direction: column; gap: 12px; }
.card {
  background: #fff; border-radius: 8px; padding: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  overflow: auto;
}
.week-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; }
.week-card { padding: 10px; }

/* 窄屏：minmax(420px,1fr) 会强制撑出横向滚动条，改成单列自适应 */
@media (max-width: 768px) {
  .week-list { grid-template-columns: minmax(0, 1fr); }
  .card { padding: 8px; }
}
.week-title {
  font-size: 13px; font-weight: 600; color: #003690;
  padding: 2px 4px 8px; border-bottom: 1px dashed #eef1f6; margin-bottom: 6px;
}
</style>
