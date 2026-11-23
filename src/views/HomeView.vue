<template>
  <div class="home">
    <div class="hero">
      <div class="hero-text">
        <h1>{{ store.currentSemester || '选择学期' }} · 排课工作台</h1>
        <p>{{ classCount }} 个班级 · {{ taskCount }} 项教学任务 · {{ slotCount }} 条排课 · 学期共 {{ store.totalWeeks }} 周</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" size="large" @click="$router.push({ name: 'schedule' })">
          进入排课 →
        </el-button>
        <el-button size="large" @click="$router.push({ name: 'audit' })">学期体检</el-button>
      </div>
    </div>

    <el-row :gutter="14" class="stat-row">
      <el-col :span="6" :xs="12" :sm="6"><div class="stat-card"><div class="stat-num">{{ store.classRooms.length }}</div><div class="stat-label">班级</div></div></el-col>
      <el-col :span="6" :xs="12" :sm="6"><div class="stat-card"><div class="stat-num">{{ store.courses.length }}</div><div class="stat-label">课程</div></div></el-col>
      <el-col :span="6" :xs="12" :sm="6"><div class="stat-card"><div class="stat-num">{{ store.teachers.length }}</div><div class="stat-label">教师</div></div></el-col>
      <el-col :span="6" :xs="12" :sm="6"><div class="stat-card"><div class="stat-num">{{ store.venues.length }}</div><div class="stat-label">教室</div></div></el-col>
    </el-row>

    <el-row :gutter="14" class="panel-row">
      <el-col :span="12" :xs="24" :sm="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>各排课单概况</span>
              <el-tag type="info" size="small">{{ sheets.length }} 张</el-tag>
            </div>
          </template>
          <el-table :data="sheets" size="small" max-height="300" @row-click="openSheet">
            <el-table-column prop="name" label="排课单" min-width="160" />
            <el-table-column label="班级" width="130">
              <template #default="{ row }">{{ store.classMap.get(row.class_id)?.name || '—' }}</template>
            </el-table-column>
            <el-table-column label="班型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="tagType(store.classMap.get(row.class_id)?.class_form)">
                  {{ shortForm(store.classMap.get(row.class_id)?.class_form) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="slot_count" label="已排" width="70" align="right" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12" :xs="24" :sm="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>学期体检速览</span>
              <el-button size="small" text @click="$router.push({ name: 'audit' })">查看详情 →</el-button>
            </div>
          </template>
          <div class="audit-summary">
            <div class="audit-num error">{{ auditResult.summary.error }}</div>
            <div class="audit-num warning">{{ auditResult.summary.warning }}</div>
          </div>
          <div class="audit-desc">错误（红）需立即处理，提醒（黄）建议复核</div>
          <div class="audit-types">
            <el-tag v-for="[type, count] in Object.entries(auditResult.byType)" :key="type"
                    size="small" :type="severity(type)" effect="plain">
              {{ label(type) }} {{ count }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="highlight-card">
      <template #header>亮点功能</template>
      <div class="highlights">
        <div class="hl-item">
          <div class="hl-icon">🎯</div>
          <div><b>拖拽式网格排课</b><br />点格即排、拖拽即调，同一格多门课自动堆叠</div>
        </div>
        <div class="hl-item">
          <div class="hl-icon">🧮</div>
          <div><b>周次位图引擎</b><br />0/1 位图精确表达单双周 / 前 8 周 / 不连续周次</div>
        </div>
        <div class="hl-item">
          <div class="hl-icon">⚡</div>
          <div><b>一键自动排课</b><br />贪心算法为选中任务自动挑空闲时段与教室</div>
        </div>
        <div class="hl-item">
          <div class="hl-icon">🔍</div>
          <div><b>12 条规则学期体检</b><br />教师/教室冲突、课时超欠、合班一致性一网打尽</div>
        </div>
        <div class="hl-item">
          <div class="hl-icon">📊</div>
          <div><b>xlsx 教务格式导出</b><br />ExcelJS 前端直接生成，A4 横向打印即用</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { auditSemester, TYPE_META } from '@/engine/audit'

const store = useDataStore()
const router = useRouter()

const classCount = computed(() => store.classRooms.filter((c) => !store.currentClassForm || c.class_form === store.currentClassForm).length)
const taskCount = computed(() => store.tasksBySemester(store.currentSemester, store.currentClassForm).length)
const slotCount = computed(() => store.slotsBySemester(store.currentSemester).length)

const sheets = computed(() =>
  store.sheetsBySemester(store.currentSemester)
    .filter((s) => {
      const cls = store.classMap.get(s.class_id)
      return !store.currentClassForm || cls?.class_form === store.currentClassForm
    })
    .map((s) => ({ ...s, slot_count: store.slotsBySheet(s.id).length }))
)

const auditResult = computed(() =>
  auditSemester({
    slots: store.slotsBySemester(store.currentSemester),
    tasks: store.tasksBySemester(store.currentSemester),
    classes: store.classRooms,
    teachers: store.teachers,
    venues: store.venues,
    courses: store.courses,
    sheets: store.scheduleSheets,
    totalWeeks: store.totalWeeks
  })
)

function severity(type) { return TYPE_META[type]?.[1] === 'error' ? 'danger' : 'warning' }
function label(type) { return TYPE_META[type]?.[0] || type }
function shortForm(f) {
  if (!f) return '—'
  return f.replace('非全日制', '')
}
function tagType(f) {
  if (f === '全日制') return 'success'
  if (f === '非全日制周末班') return 'warning'
  if (f === '非全日制集中班') return 'primary'
  return 'info'
}
function openSheet(row) {
  router.push({ name: 'schedule', query: { sheet: row.id } })
}
</script>

<style scoped>
.home { max-width: 1280px; }
.hero {
  background: linear-gradient(135deg, #003690 0%, #2563eb 100%);
  color: #fff; border-radius: 12px; padding: 22px 26px;
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; box-shadow: 0 6px 20px rgba(0, 54, 144, 0.18);
}
.hero h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }
.hero p { margin: 0; font-size: 13px; opacity: 0.85; }
.hero-actions { display: flex; gap: 10px; }

/* 窄屏：hero 标题与按钮换行，统计卡缩小字号避免溢出一屏 */
@media (max-width: 768px) {
  .hero { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px 18px; }
  .hero h1 { font-size: 18px; }
  .hero-actions { width: 100%; }
  .hero-actions .el-button { flex: 1; }
  .stat-card { padding: 12px 14px; }
  .stat-num { font-size: 20px; }
}
.stat-row { margin-bottom: 16px; }
.stat-card {
  background: #fff; border-radius: 10px; padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.stat-num { font-size: 26px; font-weight: 700; color: #003690; line-height: 1.2; }
.stat-label { font-size: 12px; color: #8a94a6; margin-top: 4px; }
.panel-row { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.audit-summary { display: flex; gap: 32px; margin: 8px 0 4px; }
.audit-num { font-size: 30px; font-weight: 700; }
.audit-num.error { color: #dc2626; }
.audit-num.warning { color: #f59e0b; }
.audit-desc { font-size: 12px; color: #8a94a6; margin-bottom: 10px; }
.audit-types { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; }
.highlight-card { margin-top: 4px; }
.highlights { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.hl-item { display: flex; gap: 10px; font-size: 12px; color: #4b5563; line-height: 1.6; }
.hl-icon { font-size: 22px; }
</style>
