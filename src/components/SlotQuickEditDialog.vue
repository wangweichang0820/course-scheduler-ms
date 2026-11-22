<template>
  <el-dialog v-model="visible" :title="title" width="560px" append-to-body>
    <el-form :model="form" label-width="96px">
      <el-row :gutter="10">
        <el-col :span="8">
          <el-form-item label="星期">
            <el-select v-model="form.day_of_week" style="width: 100%">
              <el-option v-for="o in dayOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="开始节">
            <el-select v-model="form.start_period" style="width: 100%">
              <el-option v-for="o in periodOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="连排节">
            <el-input-number v-model="form.periods" :min="1" :max="4" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="周次" required>
        <WeekPicker v-model="form.week_pattern" :total="totalWeeks" :allowed-weeks="allowedWeeks" />
      </el-form-item>
      <el-form-item label="上课地点">
        <span :class="{ 'text-soft': !locText }">{{ locText || '暂未设置' }}</span>
        <el-button link type="primary" style="margin-left: 10px" @click="onLocationEdit">设置地点</el-button>
      </el-form-item>
      <el-form-item v-if="card && card.id" label="锁定">
        <el-checkbox v-model="form.locked">锁定（清空排课时不删除）</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="danger" plain style="float: left" @click="onRemove">删除该安排</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 排课卡片快捷编辑：点课表卡片弹出，直接改星期 / 节次 / 周次 / 锁定或删除。
 * 只改草稿，不直接调接口；由父级调 useScheduleDraft.updateCard / removeCard，
 * 校验不通过（周次为空 / 重复排课）时弹窗保持打开。
 */
import { computed, ref, watch } from 'vue'
import WeekPicker from '@/components/WeekPicker.vue'
import { courseCode, locationText } from '@/utils/schedule'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 被编辑的草稿卡片（useScheduleDraft 输出，含 _state / week 等内部字段） */
  card: { type: Object, default: null },
  /** 网格显示行（含合并块 periodStart / periodEnd） */
  timeslots: { type: Array, default: () => [] },
  /** 可见星期列文本（已按班型过滤） */
  days: { type: Array, default: () => [] },
  dayOffset: { type: Number, default: 0 },
  totalWeeks: { type: Number, default: 24 },
  /** 集中班限定排课单指定周次；null 表示不限 */
  allowedWeeks: { type: Array, default: null }
})
const emit = defineEmits(['update:modelValue', 'confirm', 'remove', 'location-edit'])

const visible = ref(props.modelValue)
const form = ref({ day_of_week: 1, start_period: 1, periods: 2, week_pattern: '', locked: false })

watch(() => props.modelValue, (v) => {
  visible.value = v
  if (v && props.card) {
    const c = props.card
    form.value = {
      day_of_week: Number(c.day_of_week),
      start_period: Number(c.start_period),
      periods: Number(c.end_period ?? c.start_period) - Number(c.start_period) + 1,
      week_pattern: String(c.week_pattern || ''),
      locked: !!c.locked
    }
  }
})
watch(visible, (v) => emit('update:modelValue', v))

const title = computed(() => {
  const c = props.card
  if (!c) return '调整排课'
  const code = courseCode(c)
  return `调整排课 · ${c.course_name || ''}${code ? '（' + code + '）' : ''}`
})

const locText = computed(() => locationText(props.card))

/** 星期选项：显示列 -> 真实星期（周末班从周六=6 开始） */
const dayOptions = computed(() =>
  (props.days || []).map((d, i) => ({ value: i + 1 + Number(props.dayOffset || 0), label: d }))
)

/** 节次选项：把合并显示行展开成逐节（第1-2节行 -> 第1节 / 第2节） */
const periodOptions = computed(() => {
  const out = []
  for (const p of props.timeslots || []) {
    const s = Number(p.periodStart ?? p.period)
    const e = Number(p.periodEnd ?? p.period)
    for (let n = s; n <= e; n++) out.push({ value: n, label: `第${n}节` })
  }
  return out
})

function onConfirm() {
  const maxP = periodOptions.value.length
    ? periodOptions.value[periodOptions.value.length - 1].value
    : 7
  const start = Number(form.value.start_period)
  const end = Math.min(start + Number(form.value.periods) - 1, maxP)
  // 校验由父级 updateCard 完成：不通过时弹窗保持打开
  emit('confirm', {
    day_of_week: Number(form.value.day_of_week),
    start_period: start,
    end_period: end,
    week_pattern: form.value.week_pattern,
    locked: form.value.locked
  })
}

function onRemove() {
  emit('remove', props.card)
  visible.value = false
}

/** 设置地点：关闭本弹窗，交父级走现有地点编辑流程（草稿就地选 / 已保存调接口） */
function onLocationEdit() {
  emit('location-edit', props.card)
  visible.value = false
}
</script>