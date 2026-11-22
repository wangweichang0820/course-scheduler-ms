# 部署到 Qoder Sites · 三步上线

本项目为**纯前端 SPA**，构建产物 `dist/` 是标准静态资源目录，可直接被 [Qoder Sites](https://docs.qoder.com/zh/cli/sites) 托管。路由已用 hash 模式（`createWebHashHistory`），**无需任何服务端 rewrite**。

## 前置条件

- 已安装并登录 **Qoder CLI**（终端能运行 `qoder` 命令）
- 项目本地已通过 `npm run build`（生成 `dist/`）

## 方式一 · 会话内自然语言（推荐）

在 Qoder CLI 交互式会话里，把项目目录切到 `d:\project\北交大MEM排课系统`，直接对 Agent 说：

```
帮我把当前项目的 dist 发布成 Qoder Sites 站点，名字 bjtu-mem-scheduler，访问策略设为公开免登录。
```

内置 Skill `sites:sites-hosting` 会：

1. 调用 `prepare_site` 建立站点骨架（若无）
2. 调用 `publish_site` 上传 `dist/`
3. 调用 `get_publish_status` 轮询直到 ready
4. 输出可访问的公开 URL

发布、删除、修改共享策略属于写操作，Agent 会先复述影响并要求确认。

## 方式二 · `/sites` 面板

在 Qoder 交互式会话里输入 `/sites` 打开面板：

- **列表**：浏览你已有的站点与共享给你的站点
- **新建 / 发布**：从就绪的部署中选择 → 确认
- **共享策略**：私有 / 指定成员 / 组织 / 公开（公开需二次确认）
- **环境变量**：本项目**不需要**任何 Secret

## 方式三 · 终端子命令（脚本化 / CI）

```powershell
# 1. 先看已有站点
qoder sites list_sites --input '{\"page\":1}'

# 2. 查询具体发布操作的参数 Schema
qoder sites describe prepare_site
qoder sites describe publish_site

# 3. 让 Skill 帮你走完整流程（推荐用方式一，脚本会绕过确认保护）
```

> ⚠️ `prepare_site / publish_site / update_access_policy` 这类**写操作**由 Skills 携带会话上下文调用（`--session`），带确认与幂等语义。**不建议手工构造 JSON 请求**，以免绕过确认。

## 部署后自检清单

打开返回的公开 URL，按顺序验证：

- [ ] 首屏显示「北交大 · 研究生排课工作台」品牌头
- [ ] 侧栏 6 个菜单能正常切换，IndexedDB 首次访问会自动播种（约 300ms）
- [ ] 侧栏底部计数：`71 任务 · 16 排课`（首次播种软著申报加工数据）
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
