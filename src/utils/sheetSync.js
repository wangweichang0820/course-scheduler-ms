// 排课单在多个浏览器标签页同时打开时，合班同步结果通过 BroadcastChannel 通知其他标签页
const CHANNEL = 'sch-sheet-sync'
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null

export function notifySheetsChanged(ids) {
  if (channel && ids?.length) channel.postMessage({ sheetIds: ids.map(Number) })
}

/** 订阅其他标签页的排课单变更，返回取消订阅函数 */
export function onSheetsChanged(callback) {
  if (!channel) return () => {}
  const handler = (event) => callback(event.data?.sheetIds || [])
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}
