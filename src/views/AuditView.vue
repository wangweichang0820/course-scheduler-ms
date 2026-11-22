<template>
  <div class="audit">
    <div class="toolbar">
      <div class="sum-row">
        <div class="sum-card error">
          <div class="sum-num">{{ result.summary.error }}</div>
          <div class="sum-label">错误</div>
        </div>
        <div class="sum-card warning">
          <div class="sum-num">{{ result.summary.warning }}</div>
          <div class="sum-label">提醒</div>
        </div>
        <div class="sum-card">
          <div class="sum-num">{{ result.summary.slot_count }}</div>
          <div class="sum-label">扫描排课</div>
        </div>
        <div class="sum-card">
          <div class="sum-num">{{ result.summary.hit_slot_count }}</div>
          <div class="sum-label">涉及记录</div>
        </div>
      </div>
      <div class="spacer"></div>
      <el-select v-model="severity" size="default" style="width: 130px">
        <el-option label="全部级别" value="" />
        <el-option label="仅错误" value="error" />
        <el-option label="仅提醒" value="warning" />
      </el-select>
      <el-select v-model="typeFilter" size="default" style="width: 200px" clearable placeholder="按类型筛选">
        <el-option v-for="t in result.typeOptions" :key="t.value" :label="`${t.label}（${result.byType[t.value] || 0}）`" :value="t.value" />
      </el-select>
      <el-button @click="rerun">重跑体检</el-button>
    </div>

    <el-empty v-if="!filtered.length" description="🎉 全学期未发现冲突，可以放心导出课表" />

    <el-table v-else :data="filtered" size="small" border stripe row-key="key" max-height="720">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand">
            <div v-for="s in row.slots" :key="s.slot_id" class="slot-line">
              <el-tag size="small" :type="severityTag(row.severity)" effect="plain">{{ row.label }}</el-tag>
              <span class="slot-name">{{ s.course_name }}</span>
              <span class="slot-teacher">👤 {{ s.teacher_names }}</span>
              <span class="slot-time">📅 {{ s.day_text }} {{ s.period_text }} {{ s.weeks_text }}</span>
              <span class="slot-room">🏫 {{ s.room_no || '未设置' }}</span>
            </div>
            <div class="expand-actions">
              <el-button size="small" type="primary" @click="jump(s0(row))">跳转到排课</el-button>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="级别" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="severityTag(row.severity)" effect="dark">{{ row.severity === 'error' ? '错误' : '提醒' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="label" label="类型" width="150" />
      <el-table-column prop="message" label="问题描述" min-width="320" />
      <el-table-column prop="subject" label="主体" width="140" show-overflow-tooltip />
      <el-table-column label="涉及" width="70" align="right">
        <template #default="{ row }">{{ row.slot_count }} 条</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { auditSemester } from '@/engine/audit'

const store = useDataStore()
const router = useRouter()

const severity = ref('')
const typeFilter = ref('')
const result = ref(empty())

function empty() { return { summary: { error: 0, warning: 0, slot_count: 0, hit_slot_count: 0 }, items: [], byType: {}, typeOptions: [] } }

function rerun() {
  result.value = auditSemester({
    slots: store.slotsBySemester(store.currentSemester),
    tasks: store.tasksBySemester(store.currentSemester),
    classes: store.classRooms,
    teachers: store.teachers,
    venues: store.venues,
    courses: store.courses,
    sheets: store.scheduleSheets,
    totalWeeks: store.totalWeeks
  })
}

onMounted(rerun)

const filtered = computed(() => {
  let list = result.value.items
  if (severity.value) list = list.filter((i) => i.severity === severity.value)
  if (typeFilter.value) list = list.filter((i) => i.type === typeFilter.value)
  return list
})

function severityTag(s) { return s === 'error' ? 'danger' : 'warning' }

function s0(row) {
  const first = row.slots[0]
  if (!first) return null
  return { sheet: first.sheet_id }
}

function jump(target) {
  if (!target) return
  router.push({ name: 'schedule', query: { sheet: target.sheet } })
}
</script>

<style scoped>
.audit { max-width: 1280px; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.sum-row { display: flex; gap: 10px; }
.sum-card {
  background: #fff; padding: 10px 20px; border-radius: 8px; min-width: 100px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.sum-num { font-size: 22px; font-weight: 700; color: #1f2d3d; line-height: 1.2; }
.sum-label { font-size: 12px; color: #8a94a6; }
.sum-card.error .sum-num { color: #dc2626; }
.sum-card.warning .sum-num { color: #f59e0b; }
.spacer { flex: 1; }
.expand { padding: 12px 24px; background: #f9fafb; }
.slot-line {
  display: flex; gap: 14px; align-items: center; padding: 6px 0;
  font-size: 12px; color: #4b5563; border-bottom: 1px dashed #eef1f6;
}
.slot-line:last-of-type { border-bottom: none; }
.slot-name { font-weight: 600; color: #1f2d3d; min-width: 200px; }
.slot-teacher { min-width: 100px; }
.slot-time { flex: 1; }
.slot-room { color: #6b7280; }
.expand-actions { margin-top: 10px; text-align: right; }
</style>
