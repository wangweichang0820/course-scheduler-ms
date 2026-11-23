# 部署到 Qoder Sites · 三步上线

本项目为**纯前端 SPA**，构建产物 `dist/` 是标准静态资源目录（本次交付已预构建），可直接被 Qoder Sites 托管。路由已用 hash 模式（`createWebHashHistory`），**无需任何服务端 rewrite**。

## ✅ 当前已发布站点

| 项 | 值 |
|---|---|
| 公开访问地址 | <https://bjtu-mem-scheduler-nwdvyg6mjmb.qoder.zone/#/> |
| 域名后缀 | `.qoder.zone`（非 `.qoder.website` / `.qoder.app`） |
| 访问策略 | 公开免登录 |
| 发布入口 | Qoder 桌面端左侧「站点」 |
| 自检结果 | 2026-11-22 六项端到端自检全部通过，console 零错误零警告 |

## 前置条件

- 已安装并登录 **Qoder 桌面端**（从 https://qoder.com 下载，与写代码用的 Qoder IDE 是两个独立应用）
- 本地已跑过 `npm run build`，`dist/index.html + assets/` 就绪（已确认 2.9 MB / 20 个文件）

> ℹ️ **Qoder IDE（编辑器）本身没有「站点」面板**，Sites 能力位于 Qoder 桌面端与 Qoder CLI。

## 方式一 · Qoder 桌面端左侧「站点」（本次实际使用、推荐）

1. 打开 **Qoder 桌面端**，确认右上角已登录参赛帐号
2. 左侧活动栏 → 点 **站点**（编辑器类图标，悬停提示「站点」）
3. **添加站点**，输入名称 `bjtu-mem-scheduler`（实际分配的子域会附加随机后缀，如 `bjtu-mem-scheduler-nwdvyg6mjmb`）
4. 将下面这段话粘贴到对话输入框发送：
   ```
   已从项目根目录的 dist 目录构建好静态产物，
   请直接把它作为静态站点发布，不需要重写任何业务代码，
   访问策略设为公开免登录，便于评委直接打开。
   ```
5. Agent 会调用内置 Sites Skills（`sites:sites-building` + `sites:sites-hosting`）：
   prepare_site → publish_site → 轮询发布状态 → 回传公开链接
6. 发布成功后，到站点详情里将共享策略确认为 **公开**（默认仅自己可见，需要手动改）

写操作（发布 / 删除 / 改共享策略）Agent 会先复述影响并要求确认，不会静默上线。

## 方式二 · Qoder CLI 会话内自然语言 / `/sites` 面板

适用于脚本化或 CI 场景，需先从 https://qoder.com/cli 安装 Qoder CLI：

```
$ cd <项目根目录>
$ qoder           # 进入交互式会话
> 帮我把 dist 发布成站点，名字 bjtu-mem-scheduler，访问策略公开
```

也可在会话内输入 `/sites` 打开面板可视化管理站点、共享策略与环境变量。

> 注意：本仓库开发用的 Qoder IDE 环境中 **`qodercn CLI is not installed`**（仅 IDE 自带的 `code.cmd` 启动器），`qoder sites` 子命令不可用。

## 方式三 · 终端子命令（已安装 Qoder CLI 后才可用）

```powershell
# 1. 先看已有站点
qoder sites list_sites --input '{"page":1}'

# 2. 查询具体发布操作的参数 Schema
qoder sites describe prepare_site
qoder sites describe publish_site

# 3. 建议还是用方式一或二，手工脚本会绕过确认保护
```

> ⚠️ `prepare_site / publish_site / update_access_policy` 这类**写操作**由 Skills 携带会话上下文调用（`--session`），带确认与幂等语义。**不建议手工构造 JSON 请求**，以免绕过确认。

## 部署后自检清单

打开返回的公开 URL，按顺序验证：

- [ ] 首屏显示「研究生排课工作台」品牌头
- [ ] 侧栏 6 个菜单能正常切换，IndexedDB 首次访问会自动播种（约 300ms）
- [ ] 首页 hero 副行显示「9 个班级 · 71 项教学任务 · 16 条排课」（首次播种真实脱敏种子数据）
- [ ] 「学期体检」页能扫一遍 16 条已有 slot，至少产出课时不匹配 / 未排任务提醒 / 老师任务量 3 类中一或多类命中
- [ ] 「排课工作台」页 → ⚡一键自动排课 能放置至少 1 门 pending 任务
- [ ] 「课表查看」页 → 导出 xlsx 能下载并正常在 Excel / WPS 打开

## 回滚 / 更新

代码修改后重新构建、再发布：

```powershell
npm run build
```

然后在 Qoder 桌面端（或 CLI）的站点会话里说：`重新发布 dist 到站点 bjtu-mem-scheduler-nwdvyg6mjmb`。

Qoder Sites 会创建新的部署版本，旧版本自动保留可回滚。

## 常见问题

**Q1：为什么用 hash 路由而不是 history？**
A：Qoder Sites 是纯静态托管，history 模式需服务端 rewrite；hash 模式零配置即可，且支持把 `#/schedule?sheet=3` 直接分享给评委。

**Q2：IndexedDB 数据会不会带到别人浏览器？**
A：不会。所有 demo 数据只存在**访问者本机**浏览器 IndexedDB 里；不同浏览器/不同设备各自独立；用户清缓存即回到出厂。这也意味着**评委打开就是干净的 demo 状态**。

**Q3：能不能改造成带后端持久化？**
A：可以。数据层已封装在 `src/db/indexed.js` + `src/stores/data.js`，把 Dexie 的 CRUD 换成 axios 即可；本赛题要求「轻量化 & 免部署」，故选择纯前端。

**Q4：站点能加自定义域名吗？**
A：可以，在 `/sites` 面板 → 站点详情 → 域名，按提示配 DNS CNAME。
