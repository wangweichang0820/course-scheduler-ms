<template>
  <el-dialog :model-value="modelValue" :title="dialogTitle" width="92%" top="4vh"
    :fullscreen="isMobile" class="ft-dialog" @update:model-value="close">
    <div class="toolbar">
      <el-select v-if="weeks.length" v-model="jumpWeek" placeholder="跳转到周次" class="ctrl-sm" @change="jumpTo">
        <el-option v-for="w in weeks" :key="w.week"
          :label="isTeacher ? `第 ${w.week} 周（本人 ${w.own} 节）` : `第 ${w.week} 周（${w.total} 节）`" :value="w.week" />
      </el-select>
      <el-checkbox v-if="isTeacher" v-model="onlyOwnWeeks" size="small">只看本人有课的周次</el-checkbox>
      <div class="grow" />
      <span class="text-soft hint">
        共 {{ totalWeeks }} 周 · 有课 {{ weeks.length }} 周
        <template v-if="isTeacher"> · 显示 {{ shownWeeks.length }} 周</template>
      </span>
      <el-button :icon="'Download'" size="small" :loading="exporting" @click="exportAll">导出逐周课表</el-button>
    </div>

    <div v-loading="loading" class="ft-body">
      <el-empty v-if="!loading && !shownWeeks.length" :description="emptyText" />
      <section v-for="w in shownWeeks" :id="`ft-week-${w.week}`" :key="w.week" class="ft-week">
        <div class="ft-week-head">
          <span class="ft-week-no">第 {{ w.week }} 周</span>
          <el-tag v-if="isTeacher" size="small" :type="w.own ? 'success' : 'info'" effect="plain">
            本人 {{ w.own }} 节
          </el-tag>
          <el-tag size="small" type="info" effect="plain">本班级共 {{ w.total }} 节</el-tag>
          <el-tag v-if="w.marks.length" size="small" type="warning" effect="plain">
            标注 {{ w.marks.length }} 处
          </el-tag>
        </div>
        <!-- 逐周网格：手机上也用同一张网格，容器横向滑动、节次列吸左（与简表同一交互） -->
        <div class="ft-grid-wrap" :style="{ '--ft-grid-min': `${gridMinWidth}px` }">
          <TimetableGrid :timeslots="displayTimeslots" :days="visibleDays" :day-offset="dayOffset"
            :slots="w.slots" :marks="w.marks" stacked simple :editable="false" />
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup>
/**
 * 班级完整课表弹窗：把本学期按教学周逐周展开，每周一张网格。
 * 数据直接复用列表页已取到的该班级排课记录（含他人课程的位置），
 * 周次归属按排课的周次位图判断（与后端周次筛选口径一致，不看节假日校历）。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import TimetableGrid from '@/components/TimetableGrid.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { buildWeekModel } from '@/utils/compactGrid'
import { buildDisplayTimeslots, filterVisibleDays } from '@/utils/schedule'
import { exportWeeksXlsx } from '@/utils/exportTimetable'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 班级标题信息：{ class_label, class_form, semester } */
  info: { type: Object, default: () => ({}) },
  items: { type: Array, default: () => [] },
  /** 该课表涉及教师的周次标注（原始标注记录，弹窗按周筛选后叠加显示） */
  marks: { type: Array, default: () => [] },
  timeslots: { type: Array, default: () => [] },
  days: { type: Array, default: () => [] },
  totalWeeks: { type: Number, default: 0 },
  isTeacher: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

/** 手机上全屏打开；逐周仍是网格，靠容器横向滑动 + 节次列吸左来看完全部星期 */
const isMobile = useIsMobile()

const onlyOwnWeeks = ref(props.isTeacher)
const jumpWeek = ref(null)

const dialogTitle = computed(() =>
  `完整课表 · ${props.info?.class_label || ''}${props.info?.semester ? ' · ' + props.info.semester : ''}`
)

const visibleDays = computed(() => filterVisibleDays(props.days, props.info?.class_form))
const dayOffset = computed(() => {
  const first = visibleDays.value[0]
  const idx = first ? props.days.indexOf(first) : -1
  return idx > 0 ? idx : 0
})
const displayTimeslots = computed(() =>
  buildDisplayTimeslots(props.timeslots, props.info?.class_form)
)
/** 手机端网格最小宽度：72px 节次列 + 每天 92px + 列间隙 4px，不够时横向滑动 */
const gridMinWidth = computed(() =>
  72 + visibleDays.value.length * 92 + (visibleDays.value.length + 1) * 4
)

/** 逐周分组：有课的周，以及只有标注的周（标注就是用来标空档占用的） */
const weeks = computed(() => buildWeekModel({
  items: props.items,
  marks: props.marks,
  totalWeeks: props.totalWeeks
}))

const shownWeeks = computed(() =>
  props.isTeacher && onlyOwnWeeks.value ? weeks.value.filter((w) => w.own > 0) : weeks.value
)

const emptyText = computed(() =>
  props.isTeacher && onlyOwnWeeks.value
    ? '本班级本学期没有本人课程所在的周次，取消勾选可查看全部周次'
    : '该班级本学期暂无排课'
)

function jumpTo(week) {
  const el = document.getElementById(`ft-week-${week}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function close(value) {
  emit('update:modelValue', value)
}

/** 导出逐周课表（学期周次口径与「我的课表」一致） */
const exporting = ref(false)
async function exportAll() {
  if (!shownWeeks.value.length) return ElMessage.warning('没有可导出的周次')
  exporting.value = true
  try {
    const ws = shownWeeks.value.map((w) => ({ week: w.week, slots: w.slots, marks: w.marks }))
    await exportWeeksXlsx(
      // 文件名与首行标题一致（我的课表按班级命名，无排课单上下文）
      dialogTitle.value,
      {
        timeslots: displayTimeslots.value,
        days: visibleDays.value,
        weeks: ws,
        // 周末班/集中班只展示部分星期列，导出要按同样的偏移对齐真实星期
        dayOffset: dayOffset.value,
        title: dialogTitle.value
      }
    )
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
/* grow 走全局工具类；hint 的字号/颜色走全局 .hint */
.ctrl-sm { width: 220px; }
.ft-body {
  max-height: 70vh;
  overflow: auto;
  padding-right: 6px;
}
.ft-week + .ft-week { margin-top: 20px; }
.ft-week-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 5;
}
.ft-week-no { font-size: 14px; font-weight: 600; }

/* 逐周网格：容器只负责横向滑动，桌面下网格自适应宽度、不出滚动条 */
.ft-grid-wrap { overflow-x: auto; overflow-y: hidden; }

/* ---------- 移动端：全屏弹窗里整体滚动，不再套一层 70vh 内滚动 ---------- */
@media (max-width: 768px) {
  .ctrl-sm { flex: 1 1 160px; width: auto; min-width: 0; }
  .ft-body { max-height: none; overflow: visible; padding-right: 0; }
  .ft-week + .ft-week { margin-top: 16px; }
  .ft-week-head { flex-wrap: wrap; gap: 6px; }
  /* 网格保持可读列宽，宽度不够时横向滑动；节次列与左上角格吸左不动 */
  .ft-grid-wrap { padding-bottom: 4px; }
  .ft-grid-wrap :deep(.tt-grid) { min-width: var(--ft-grid-min); --tt-first-col: 72px; }
  .ft-grid-wrap :deep(.tt-corner),
  .ft-grid-wrap :deep(.tt-period) {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #f4f6fa;
    /* 盖住列间隙，避免右侧内容从 4px 缝隙里透出来 */
    box-shadow: 4px 0 0 #fff;
  }
  .ft-grid-wrap :deep(.tt-corner) { z-index: 4; }
  .ft-grid-wrap :deep(.tt-head) { padding: 5px 2px; font-size: 11.5px; }
  .ft-grid-wrap :deep(.tt-period) { padding: 4px 2px; }
  .ft-grid-wrap :deep(.tt-period-time) { font-size: 9.5px; }
  .ft-grid-wrap :deep(.tt-period-credit) { font-size: 9px; }
  .ft-grid-wrap :deep(.tt-stack-name) { font-size: 10.5px; }
  .ft-grid-wrap :deep(.tt-stack-meta) { font-size: 9.5px; }
  .ft-grid-wrap :deep(.tt-cell-stack) { padding: 3px 2px; }
}
</style>
