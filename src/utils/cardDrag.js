import { ref } from 'vue'

/**
 * 正在拖动的课表卡片（模块级共享）：
 * 集中班每周一张 ScheduleGrid，跨周拖动时源网格与目标网格不是同一实例，
 * 用共享 ref 传递卡片，避免依赖 dataTransfer 的序列化。
 */
export const draggingCard = ref(null)