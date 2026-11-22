<template>
  <div ref="wrapEl" class="wt-compact-wrap" :class="{ 'wt-sticky-fallback': stickyFallback }"
    @scroll.passive="onScroll">
    <el-empty v-if="!sortedTimeslots.length" description="暂无课表数据" :image-size="60" />
    <table v-else class="wt-compact" :class="{ 'wt-many-days': visibleDays.length >= 4 }">
      <thead>
        <tr>
          <th class="wt-c-corner">节次</th>
          <th v-for="d in visibleDays" :key="d">{{ d }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in sortedTimeslots" :key="p.period">
          <th class="wt-c-period">
            <div>{{ p.label }}</div>
            <div>{{ p.start }}-{{ p.end }}</div>
          </th>
          <td v-for="(d, di) in visibleDays" :key="`${p.period}-${di}`" class="wt-c-cell"
            :class="{ 'wt-c-clickable': clickable }"
            :data-cell="clickable ? `${di + 1 + dayOffset}-${p.period}` : null"
            @click="onCellClick($event, di, p)">
            <div v-for="it in compactGrid[`${di + 1 + dayOffset}-${p.period}`] || []" :key="it.key" class="wt-c-item">
              <!-- 管理员的周次标注（如「本科课程」）：实色小块 + 占用周次，不属于排课数据；
                   外部课表导入的「其他」标注额外显示课程名 / 课号 / 地点 -->
              <template v-if="it.mark">
                <div class="wt-c-mark" :style="{ backgroundColor: it.color }">{{ it.label }}</div>
                <span v-if="it.conflicts && it.conflicts.length" class="wt-c-conflict"
                  :title="it.conflicts.map((c) => c.message).join('；')">冲突</span>
                <div v-if="it.source === 'import' && it.course_name" class="wt-c-name wt-c-mark-name"
                  :style="{ color: it.color }">
                  {{ it.course_name }}<span v-if="it.course_code" class="wt-c-sec"> {{ it.course_code }}<template
                      v-if="it.section_no"> [{{ it.section_no }}]</template></span>
                </div>
                <div class="wt-c-meta">{{ it.weeks_text }}<template v-if="it.location"> {{ it.location }}</template><template
                    v-if="it.remark"> {{ it.remark }}</template></div>
              </template>
              <!-- 整格只有他人课程：一个色块，块内写该时段全部占用周次的并集 -->
              <div v-else-if="it.masked" class="wt-c-mask" title="其他教师课程，周次为该时段的占用区间">
                {{ it.weeks_text || '其他教师课程' }}
              </div>
              <template v-else>
                <div class="wt-c-name" :style="{ color: taskColor(it.task_id).solid }">
                  {{ it.course_name }}<template v-if="it.teachers"> -{{ it.teachers }}</template><span
                    v-if="it.section_no" class="wt-c-sec"> [{{ it.section_no }}]</span>
                </div>
                <div class="wt-c-meta">{{ it.weeks_text }}<template v-if="it.location">{{ ' ' + it.location }}</template><span
                    v-else class="wt-c-noloc"> 未设置地点</span></div>
              </template>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
/**
 * 简版课表：一张「节次 × 星期」压缩表，同格同地点的课程周次合并。
 * 我的课表的班级卡片、班级完整课表弹窗的顶部概览都用它。
 * 班型决定星期列（全日制周一~五 / 周末班周六日 / 集中班周四~日）与合并节次行；
 * 教师视角下 masked=true 的记录不显示课程与教师，整格并成一个灰块，块内写占用周次。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { taskColor } from '@/utils/taskColor'
import { buildCompactModel } from '@/utils/compactGrid'

const props = defineProps({
  /** 排课记录（serialize_slot 输出，可含 masked 记录） */
  items: { type: Array, default: () => [] },
  timeslots: { type: Array, default: () => [] },
  days: { type: Array, default: () => [] },
  /** 班型：决定星期列与节次合并方式 */
  classForm: { type: String, default: '' },
  /** 周次标注（原始记录）：叠加在格子里的色块，与排课无关 */
  marks: { type: Array, default: () => [] },
  /** 滚动容器最大高度（班级卡片里默认整表展开，弹窗里可限高） */
  maxHeight: { type: String, default: 'none' },
  /** 可点击模式：点格子抛出 cell-click（标注管理弹窗用），默认关闭不影响其它用法 */
  clickable: { type: Boolean, default: false }
})
const emit = defineEmits(['cell-click'])

/** 点格子：把星期 / 显示行节次区间 / DOM 元素抛给父级（用于定位 popover） */
function onCellClick(e, di, p) {
  if (!props.clickable) return
  emit('cell-click', {
    day: di + 1 + dayOffset.value,
    period: Number(p.period),
    periodStart: Number(p.periodStart ?? p.period),
    periodEnd: Number(p.periodEnd ?? p.period),
    el: e.currentTarget
  })
}

/**
 * 网格、星期列、合并行都由 compactGrid 统一算：
 * 批量导出走同一个函数，导出结果和页面必然一致。
 */
const model = computed(() => buildCompactModel({
  items: props.items,
  timeslots: props.timeslots,
  days: props.days,
  classForm: props.classForm,
  marks: props.marks
}))
const visibleDays = computed(() => model.value.visibleDays)
const dayOffset = computed(() => model.value.dayOffset)
const sortedTimeslots = computed(() => model.value.timeslots)
const compactGrid = computed(() => model.value.grid)

/**
 * 节次列吸左：优先用表格单元格的 position:sticky（Chromium 下零延迟），
 * 但部分移动端内核（微信 / iOS Safari 的 WebKit）对表格单元格 sticky 不生效，
 * 节次列会跟着一起滚。首次横向滚动时探测一次：发现偏移就在包裹层加
 * .wt-sticky-fallback，改用「滚动位移写进 --wt-sx、节次列 transform 抵消」。
 */
const wrapEl = ref(null)
const stickyFallback = ref(false)
let probed = false
function onScroll(e) {
  const el = e.currentTarget
  el.style.setProperty('--wt-sx', `${el.scrollLeft}px`)
  if (probed || el.scrollLeft < 24) return
  const cell = el.querySelector('th.wt-c-period')
  if (!cell) return
  probed = true
  // 原生吸左生效时两者差 ≈0；不生效时会随内容左移约 scrollLeft
  const drift = cell.getBoundingClientRect().left - el.getBoundingClientRect().left
  stickyFallback.value = drift < -4
}
// 切换学期 / 班型后表格内容与滚动宽度会变，重算一次偏移，避免残留位移
watch(compactGrid, () => {
  nextTick(() => {
    const el = wrapEl.value
    if (el) el.style.setProperty('--wt-sx', `${el.scrollLeft}px`)
  })
})
</script>

<style scoped>
.wt-compact-wrap {
  overflow: auto;
  max-height: v-bind(maxHeight);
}
.wt-compact {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.wt-compact th,
.wt-compact td {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.wt-compact th:first-child,
.wt-compact td:first-child { border-left: 1px solid var(--border); }
.wt-compact thead th { border-top: 1px solid var(--border); }
.wt-c-corner,
.wt-compact thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f4f6fa;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}
.wt-c-corner {
  left: 0;
  width: 88px;
  /* 高于表头（z-index:3）与节次列（2），横向滑动时不被星期表头盖住 */
  z-index: 4;
}
/* 回退模式（内核不支持表格单元格 sticky）：用 --wt-sx 抵消滚动位移 */
.wt-compact-wrap.wt-sticky-fallback .wt-c-period {
  position: relative;
  transform: translateX(var(--wt-sx, 0px));
  will-change: transform;
}
.wt-compact-wrap.wt-sticky-fallback .wt-c-corner {
  left: auto;
  transform: translateX(var(--wt-sx, 0px));
  will-change: transform;
}
.wt-c-period {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 88px;
  background: #f4f6fa;
  padding: 6px 4px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}
.wt-c-period div:last-child {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-soft);
}
.wt-c-cell {
  padding: 4px;
  vertical-align: top;
  min-height: 54px;
}
/* 可点击模式：hover 给品牌浅底 + 描边，提示这一格可以点 */
.wt-c-clickable { cursor: pointer; transition: background 0.12s; }
.wt-c-clickable:hover {
  background: var(--brand-softer);
  box-shadow: inset 0 0 0 1px var(--brand-soft);
}
.wt-c-item { padding: 1px 3px; border-radius: 3px; line-height: 1.35; }
.wt-c-item + .wt-c-item { margin-top: 1px; }
.wt-c-name { font-size: 11px; font-weight: 600; word-break: break-all; }
.wt-c-sec { color: #64748b; font-weight: 500; }
.wt-c-meta { font-size: 10px; color: var(--text-soft); word-break: break-all; }
.wt-c-noloc { color: #b0b8c4; }
/* 周次标注色块：实底 + 白字，宽度自适应文本，一眼能和课程名区分开 */
.wt-c-mark {
  display: inline-block;
  margin: 1px 0 0;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-all;
}
/* 导入课程的课程名行：跟随标注色，与色块视觉上成一组 */
.wt-c-mark-name { margin-top: 1px; }
/* 与系统排课教师时间冲突的标注：红色小标，hover 看冲突明细 */
.wt-c-conflict {
  display: inline-block;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 3px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  cursor: help;
}
/* 他人课程色块：斜纹底 + 柔和描边，块内写周次区间，一眼看出只是部分周有课 */
.wt-c-mask {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  margin: 2px 1px;
  padding: 3px 4px;
  border-radius: 6px;
  color: #64748b;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  word-break: break-all;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0 5px, rgba(255, 255, 255, 0) 5px 11px),
    linear-gradient(180deg, #dbe3ef, #edf1f7);
  box-shadow: inset 0 0 0 1px #c9d4e4, 0 1px 2px rgba(100, 116, 139, 0.12);
}
.wt-c-mask:hover {
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0 5px, rgba(255, 255, 255, 0) 5px 11px),
    linear-gradient(180deg, #d2dcea, #e6ecf5);
}

/* ---------- 移动端网格：列多时横向滑动，节次列固定左侧 ---------- */
@media (max-width: 768px) {
  .wt-compact.wt-many-days { min-width: 520px; }
  .wt-c-corner,
  .wt-c-period { width: 64px; padding: 5px 3px; }
  .wt-c-period { font-size: 10.5px; }
  .wt-c-period div:last-child { font-size: 9.5px; }
  .wt-compact thead th { padding: 5px 2px; font-size: 11.5px; }
  .wt-c-cell { padding: 3px 2px; }
  .wt-compact-wrap { scrollbar-width: thin; overscroll-behavior-x: contain; }
}
</style>
