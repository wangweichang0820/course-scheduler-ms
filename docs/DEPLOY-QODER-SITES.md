# 部署到 Qoder Sites · 三步上线

本项目为**纯前端 SPA**，构建产物 `dist/` 是标准静态资源目录（本次交付已预构建），可直接被 Qoder Sites 托管。路由已用 hash 模式（`createWebHashHistory`），**无需任何服务端 rewrite**。

## ✅ 当前已发布站点

| 项 | 值 |
|---|---|
| 公开访问地址 | <https://mem-scheduler-nwdvyg6mjmb.qoder.zone/#/> |
| 域名后缀 | `.qoder.zone`（非 `.qoder.website` / `.qoder.app`） |
| 访问策略 | 公开免登录 |
| 发布入口 | Qoder 桌面端左侧「站点」 |
| 自检结果 | 2026-11-23 真实浏览器自检：6 页导航正常、console 零运行时错误、IndexedDB 建库 `mem-scheduler@v20`。**但线上 bundle 仍是 `index-Cvjc4vG9.js`，favicon 进 404**（本地已修好并重新构建为 `index-hZlrFUt7.js`，等重新发布） |

> ⚠️ **地址前缀变更过**：早期发布的那版链接已失效，网关返 `{"code":"sites_gateway_site_not_found"}`；上表是当前生效地址。
> 站点名 / 地址前缀在 `More → Settings → General` 可改，**改完旧 URL 立即失效**，而本地 `.qoder.site` 状态文件里并不记录域名，
> 所以仓库里的链接只能靠人工核对。每次改完前缀都要回到发布记录重新复制地址。

## 前置条件

- 已安装并登录 **Qoder 桌面端**（从 https://qoder.com 下载，与写代码用的 Qoder IDE 是两个独立应用）
- 本地已跑过 `npm run build`，`dist/index.html + assets/` 就绪（已确认 2.9 MB / 20 个文件）

> ℹ️ **Qoder IDE（编辑器）本身没有「站点」面板**，Sites 能力位于 Qoder 桌面端与 Qoder CLI。

## 方式一 · Qoder 桌面端左侧「站点」（本次实际使用、推荐）

1. 打开 **Qoder 桌面端**，确认右上角已登录参赛帐号
2. 左侧活动栏 → 点 **站点**（编辑器类图标，悬停提示「站点」）
3. **添加站点**，输入名称 `mem-scheduler`（实际分配的子域会追加随机后缀，如 `mem-scheduler-nwdvyg6mjmb`）
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
> 帮我把 dist 发布成站点，名字 mem-scheduler，访问策略公开
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
- [ ] 首页 hero 副行显示「9 个班级 · 71 项教学任务 · 16 条排课 · 学期共 19 周」（首次播种真实脱敏种子数据）
- [ ] 「学期体检」页能扫一遍 16 条已有 slot，至少产出课时不匹配 / 未排任务提醒 / 老师任务量 3 类中一或多类命中
- [ ] 「排课工作台」页 → ⚡一键自动排课 能放置至少 1 门 pending 任务
- [ ] 「课表查看」页 → 导出 xlsx 能下载并正常在 Excel / WPS 打开

## 回滚 / 更新

代码修改后重新构建、再发布：

```powershell
npm run build
```

然后在 Qoder 桌面端（或 CLI）的站点会话里说：`重新发布 dist 到站点 mem-scheduler-nwdvyg6mjmb`。

Qoder Sites 会创建新的部署版本，旧版本自动保留可回滚。

> 发布后记得确认本地 `dist/` 与线上一致：比对 `dist/index.html` 与页面源码里的 `assets/index-*.js` 哈希后缀。哈希不同就是没重发。

## 常见问题

**Q1：为什么用 hash 路由而不是 history？**
A：本项目**选择以静态产物方式发布**，而 history 模式需要服务端 rewrite；hash 模式零配置即可，且支持把 `#/schedule?sheet=3` 直接分享给评委。

**Q1b：Qoder Sites 只能做静态托管吗？**
A：不是。Sites 本身支持数据库与对象存储，但官方文档明确写了 **个人 Free 套餐只支持静态站点部署，不支持数据库与存储服务**（Lite / Pro / Pro+ / Ultra 及 Teams / Enterprise 支持）。本项目在 Free 套餐下只能走静态路线，这与赛题「轻量化 & 免部署」的取向一致。

**Q2：IndexedDB 数据会不会带到别人浏览器？**
A：不会。所有 demo 数据只存在**访问者本机**浏览器 IndexedDB 里；不同浏览器/不同设备各自独立；用户清缓存即回到出厂。这也意味着**评委打开就是干净的 demo 状态**。官方文档同样写明：发布站点不会自动把浏览器本地数据与其他用户同步。

**Q3：能不能改造成带后端持久化？**
A：可以，有三条路。① 用 Sites 自带的数据库 + Edge Function（需非 Free 套餐），把 `src/db/indexed.js` 的 Dexie CRUD 换成对后端的调用，数据模型不用动；② 保留纯前端，数据接外部服务（Supabase 等），但会把「免部署」这个卖点让出去。③ 成本最低的过渡方案：加一个 JSON 快照导入/导出，不改架构也能满足「换设备继续排」。

**Q4：站点能加自定义域名吗？**
A：可以，在 `/sites` 面板 → 站点详情 → 域名，按提示配 DNS CNAME。
