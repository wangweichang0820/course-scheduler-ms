/**
 * 响应式断点：视口 ≤768px 视为移动端（手机竖屏 / 小平板）。
 * 用 matchMedia 监听，组件卸载时自动解绑；多个组件共享同一媒体查询对象，
 * 避免每个组件各挂一个 resize 监听。
 */
import { onMounted, onUnmounted, ref } from 'vue'

const QUERY = '(max-width: 768px)'
let mql = null
const subscribers = new Set()

function getMql() {
  if (!mql && typeof window !== 'undefined' && window.matchMedia) {
    mql = window.matchMedia(QUERY)
    mql.addEventListener('change', (e) => {
      for (const fn of subscribers) fn(e.matches)
    })
  }
  return mql
}

export function useIsMobile() {
  const isMobile = ref(getMql()?.matches ?? false)
  const update = (v) => { isMobile.value = v }
  onMounted(() => {
    const m = getMql()
    if (!m) return
    isMobile.value = m.matches
    subscribers.add(update)
  })
  onUnmounted(() => subscribers.delete(update))
  return isMobile
}