# 部署到 Qoder Sites · 三步上线

本项目为**纯前端 SPA**，构建产物 `dist/` 是标准静态资源目录（本次交付已预构建），可直接被 Qoder Sites 托管。路由已用 hash 模式（`createWebHashHistory`），**无需任何服务端 rewrite**。

## 前置条件

- 已安装并登录 **Qoder IDE**（当前主机安装位置：`C:\Users\wwc\AppData\Local\Programs\Qoder CN\Qoder CN.exe`）
- 本地已跑过 `npm run build`，`dist/index.html + assets/` 就绪（已确认 2.9 MB / 20 个文件）

## 方式一 · Qoder IDE 左侧「站点」面板（本环境适用、推荐）

1. 打开 Qoder CN IDE，确认右上角已登录参赛帐号（wangweichang0820）
2. 左侧活动栏→ 点 **站点**（若无可见图标，在命令面板搜 `Sites: Open Panel`）
3. 右上 **添加站点**，输入名称 `bjtu-mem-scheduler`（可自定义展示名）
4. 输入框自动引用 `@sites`，将下面这段话粘贴发送：
   ```
   已从项目 d:\project\北交大MEM排课系统＃dist 目录构建好静态产物，
   请直接把它作为静态站点发布，不需要重写任何业务代码，
   访问策略设为公开免登录，便于评委直接打开。
   ```
5. Agent 会调用 `sites:sites-building` + `sites:sites-hosting`：prepare_site → publish_site → get_publish_status 轮询 → 回传公开链接
6. 发布成功后，到站点详情里将共享策略确认为 **公开**（默认仅自己可见，需要手动改）

写操作（发布 / 删除 / 改共享策略） Agent 会先复述影响并要求确认，不会静默上线。

## 方式二 · Qoder CLI 会话内自然语言（需安装 Qoder CLI）

本主机当前 **`qodercn CLI is not installed`**（仅 IDE 自带的 `code.cmd` 启动器，`qoder sites` 子命令不可用）。若需脚本化或 CI，先从 https://qoder.com/cli 安装 Qoder CLI，然后：

```
$ cd d:\project\北交大MEM排课系统
$ qoder           # 进入交互式会话
> 帮我把 dist 发布成站点，名字 bjtu-mem-scheduler，访问策略公开
```

也可在会话内输入 `/sites` 面板可视化管理。

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

- [ ] 首屏显示「北交大 · 研究生排课工作台」品牌头
- [ ] 侧栏 6 个菜单能正常切换，IndexedDB 首次访问会自动播种（约 300ms）
- [ ] 侧栏底部计数：`71 任务 · 16 排课`（首次播种真实脱敏种子数据）
- [ ] 「学期体检」页能扫一遍 16 条已有 slot，至少产出课时不匹配 / 未排任务提醒 / 老师任务量 3 类中一或多类命中
- [ ] 「排课工作台」页 → ⚡一键自动排课 能放置至少 1 门 pending 任务
- [ ] 「课表查看」页 → 导出 xlsx 能下载并正常在 Excel / WPS 打开

## 回滚 / 更新

代码修改后重新构建、再发布：

```powershell
npm run build
# 在 Qoder 会话里：
重新发布 dist 到站点 bjtu-mem-scheduler
```

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
