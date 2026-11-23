<template>
  <div class="entities">
    <el-tabs v-model="tab" type="border-card" class="entities-tabs">
      <el-tab-pane v-for="cfg in configs" :key="cfg.entity" :label="cfg.label" :name="cfg.entity">
        <div class="tab-toolbar">
          <el-input v-model="keyword[cfg.entity]" placeholder="搜索" clearable class="ctrl" style="--ctrl-w: 220px" size="default" :prefix-icon="Search" />
          <el-button type="primary" size="default" @click="openCreate(cfg)">
            <el-icon><Plus /></el-icon> 新增{{ cfg.label.replace('信息', '') }}
          </el-button>
          <el-button size="default" :disabled="!selected[cfg.entity]?.length" @click="bulkDelete(cfg)">批量删除（{{ selected[cfg.entity]?.length || 0 }}）</el-button>
          <div class="flex-spacer"></div>
          <el-tag type="info" size="small">共 {{ filtered(cfg).length }} 条</el-tag>
        </div>
        <!-- 表高随视口走：写死 560 时，1080 高的屏上表格提前截断、内部再滚一次，页面下方却空着一大片 -->
        <el-table :data="filtered(cfg)" size="small" border stripe @selection-change="(v) => selected[cfg.entity] = v" :max-height="tableMax">
          <el-table-column type="selection" width="42" />
          <el-table-column type="index" label="#" width="50" />
          <el-table-column v-for="f in cfg.fields.filter((x) => !x.hidden)" :key="f.key"
                           :prop="f.key" :label="f.label" :width="f.width" :min-width="f.minWidth || 100">
            <template #default="{ row }">
              <span v-if="f.type === 'switch'">
                <el-tag :type="row[f.key] ? 'success' : 'info'" size="small">{{ row[f.key] ? '启用' : '停用' }}</el-tag>
              </span>
              <span v-else-if="f.render">{{ f.render(row, store) }}</span>
              <span v-else>{{ row[f.key] }}</span>
            </template>
          </el-table-column>
          <!-- 窄屏下不再吸附：fixed 列以 position:sticky 贴在容器右缘，375 视口下会把名称列压到只剩 5px 可见宽度 -->
          <el-table-column label="操作" width="130" :fixed="isMobile ? false : 'right'">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEdit(cfg, row)">编辑</el-button>
              <el-popconfirm title="确定删除？" @confirm="onDelete(cfg, row)">
                <template #reference><el-button link type="danger" size="small">删除</el-button></template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialog.visible" :title="dialog.title" width="600px" destroy-on-close>
      <el-form :model="dialog.form" label-width="120px" size="default">
        <el-form-item v-for="f in dialog.fields" :key="f.key" :label="f.label" :required="f.required">
          <el-input v-if="!f.type || f.type === 'text'" v-model="dialog.form[f.key]" :placeholder="f.placeholder || ''" />
          <el-input-number v-else-if="f.type === 'number'" v-model="dialog.form[f.key]" :min="f.min || 0" :max="f.max || 9999" />
          <el-date-picker v-else-if="f.type === 'date'" v-model="dialog.form[f.key]" type="date" value-format="YYYY-MM-DD" />
          <el-select v-else-if="f.type === 'select'" v-model="dialog.form[f.key]">
            <el-option v-for="o in f.options" :key="o.value ?? o" :label="o.label ?? o" :value="o.value ?? o" />
          </el-select>
          <el-switch v-else-if="f.type === 'switch'" v-model="dialog.form[f.key]" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useDataStore } from '@/stores/data'
import { useIsMobile } from '@/composables/useIsMobile'
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'

const store = useDataStore()
const isMobile = useIsMobile()
const tab = ref('classRooms')
const keyword = reactive({})
const selected = reactive({})

// 占用高度：页头 60 + 上下内边距 36 + 页签头 40 + 工具条 56 + 卡片内边距与余量
const tableMax = useTableMaxHeight(300)

const configs = computed(() => [
  {
    entity: 'classRooms', label: '班级',
    fields: [
      { key: 'code', label: '代码', width: 90, required: true },
      { key: 'name', label: '班级名称', minWidth: 200, required: true },
      { key: 'study_mode', label: '学习方式', type: 'select', options: ['全日制', '非全日制'], width: 120, required: true },
      /* 弹性列只留「班级名称」一个：两列都写 min-width 时，容器富余宽度会被这两列按比例摊掉，
         各自撑到 300px 以上，表格里就全是空白 */
      { key: 'class_form', label: '授课形式', type: 'select', options: ['全日制', '非全日制周末班', '非全日制集中班'], width: 160, required: true },
      { key: 'capacity', label: '容量', type: 'number', width: 90 }
    ]
  },
  {
    entity: 'courses', label: '课程',
    fields: [
      { key: 'code', label: '课程号', width: 120, required: true },
      { key: 'name', label: '课程名称', minWidth: 220, required: true },
      { key: 'credit', label: '学分', type: 'number', width: 80 },
      { key: 'hours', label: '学时', type: 'number', width: 80 },
      { key: 'course_type', label: '课程类型', type: 'select', options: ['必修', '选修', '实践', '通识'], width: 100 },
      { key: 'teaching_mode', label: '授课模式', type: 'select', options: ['线下', '线上', '实践'], width: 100 },
      { key: 'exam_type', label: '考核方式', type: 'select', options: ['考试', '考查', '作业考察'], width: 110 },
      { key: 'department', label: '开课学院', width: 140, hidden: !store.courses.some((c) => c.department) }
    ]
  },
  {
    entity: 'teachers', label: '教师',
    fields: [
      { key: 'teacher_no', label: '工号', width: 100, required: true },
      { key: 'name', label: '姓名', width: 110, required: true },
      { key: 'title', label: '职称', type: 'select', options: ['教授', '副教授', '讲师', '助教'], width: 110 },
      { key: 'department', label: '学院', width: 140 },
      { key: 'roles', label: '角色', width: 140 },
      { key: 'email', label: '邮箱', minWidth: 200 }
    ]
  },
  {
    entity: 'venues', label: '教室场地',
    fields: [
      { key: 'room_no', label: '房间号', width: 110, required: true },
      // 本 tab 其余列全是定宽；一列弹性都没有的话，表格右侧会补出一条空白列
      { key: 'building', label: '楼栋', minWidth: 160 },
      { key: 'campus', label: '校区', width: 100 },
      { key: 'room_type', label: '类型', type: 'select', options: ['普通教室', '多媒体教室', '阶梯教室', '实验室', '机房'], width: 120 },
      { key: 'capacity', label: '容量', type: 'number', width: 80 },
      { key: 'is_available', label: '启用', type: 'switch', width: 90 }
    ]
  },
  {
    entity: 'semesters', label: '学年学期',
    fields: [
      { key: 'code', label: '学期标识', minWidth: 160, required: true },
      { key: 'academic_year', label: '学年', width: 120 },
      { key: 'term_name', label: '季节', width: 100 },
      { key: 'weeks', label: '总周数', type: 'number', width: 90 },
      { key: 'start_date', label: '开始', type: 'date', width: 130 },
      { key: 'end_date', label: '结束', type: 'date', width: 130 },
      { key: 'is_current', label: '当前', type: 'switch', width: 80 }
    ]
  },
  {
    entity: 'holidays', label: '节假日',
    fields: [
      { key: 'date', label: '日期', type: 'date', width: 140, required: true },
      { key: 'name', label: '名称', minWidth: 160, render: (row) => row.name || row.kind || (row.is_workday ? '调休上班' : '未命名假期') },
      { key: 'kind', label: '类型', width: 120 },
      { key: 'is_workday', label: '调休上班', type: 'switch', width: 110 }
    ]
  }
])

function rows(cfg) { return store[cfg.entity] || [] }
function filtered(cfg) {
  const kw = String(keyword[cfg.entity] || '').trim().toLowerCase()
  const list = rows(cfg)
  if (!kw) return list
  return list.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(kw)))
}

const dialog = reactive({
  visible: false, title: '', cfg: null, form: {}, fields: [], mode: 'create'
})

function openCreate(cfg) {
  dialog.cfg = cfg
  dialog.fields = cfg.fields
  dialog.form = Object.fromEntries(cfg.fields.map((f) => {
    if (f.type === 'number') return [f.key, 0]
    if (f.type === 'switch') return [f.key, 1]
    if (f.type === 'select') {
      const first = Array.isArray(f.options) ? f.options[0] : null
      const val = first && typeof first === 'object' ? first.value : first
      return [f.key, val != null ? val : '']
    }
    return [f.key, '']
  }))
  dialog.title = '新增' + cfg.label.replace('信息', '')
  dialog.mode = 'create'
  dialog.visible = true
}
function openEdit(cfg, row) {
  dialog.cfg = cfg
  dialog.fields = cfg.fields
  dialog.form = { ...row }
  dialog.title = '编辑' + cfg.label.replace('信息', '')
  dialog.mode = 'edit'
  dialog.visible = true
}
async function onSave() {
  try {
    if (dialog.mode === 'create') await store.create(dialog.cfg.entity, dialog.form)
    else await store.update(dialog.cfg.entity, dialog.form.id, dialog.form)
    ElMessage.success('已保存')
    dialog.visible = false
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  }
}
async function onDelete(cfg, row) {
  await store.remove(cfg.entity, row.id)
  ElMessage.success('已删除')
}
async function bulkDelete(cfg) {
  const ids = (selected[cfg.entity] || []).map((x) => x.id)
  if (!ids.length) return
  await store.bulkRemove(cfg.entity, ids)
  ElMessage.success(`已删除 ${ids.length} 条`)
  selected[cfg.entity] = []
}
</script>

<style scoped>
/* 版心居中：宽屏下限宽后若仍左对齐，剩余宽度会全部堆到右侧，看着像页面没铺满 */
.entities { max-width: 1280px; margin-inline: auto; }
.tab-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.flex-spacer { flex: 1; }
.entities-tabs :deep(.el-tabs__content) { padding: 16px; }
</style>
