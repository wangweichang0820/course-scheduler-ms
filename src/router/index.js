import { createRouter, createWebHashHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  { path: '/', component: MainLayout, children: [
    { path: '', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '工作台总览', icon: 'HomeFilled' } },
    { path: 'entities', name: 'entities', component: () => import('@/views/EntitiesView.vue'), meta: { title: '基础信息', icon: 'Files' } },
    { path: 'tasks', name: 'tasks', component: () => import('@/views/TasksView.vue'), meta: { title: '教学任务', icon: 'Notebook' } },
    { path: 'schedule', name: 'schedule', component: () => import('@/views/ScheduleView.vue'), meta: { title: '排课工作台', icon: 'Calendar' } },
    { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue'), meta: { title: '学期体检', icon: 'Warning' } },
    { path: 'timetable', name: 'timetable', component: () => import('@/views/TimetableView.vue'), meta: { title: '课表查看', icon: 'Grid' } }
  ] }
]

export default createRouter({ history: createWebHashHistory(), routes })
