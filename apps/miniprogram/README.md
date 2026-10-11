# 工业智控微信小程序

uni-app / Vue 3 / TypeScript；登录、已发布监控卡片、活动告警、观测依据、最近24小时已恢复历史和智能分析。复用 FastAPI、服务端账号会话及遥测/告警规则。编辑、拖拽和发布在电脑端完成。

## 本地启动

仓库根目录：

```bash
pnpm install
pnpm db:migrate
pnpm dev:api
pnpm dev:simulator
pnpm dev:miniprogram
```

微信开发者工具导入 `apps/miniprogram/dist/dev/mp-weixin`。单次构建用 `pnpm build:miniprogram`，导入 `apps/miniprogram/dist/build/mp-weixin`。

当前 `src/manifest.json` 的 `mp-weixin.appid` 为 `touristappid`，可选游客模式、无云服务。无需 AppSecret。若首次导入空白，选择项目本地设置中的稳定基础库，再点击编译；本机验证基础库为 3.17.3。游客模式不代表微信真机或正式上线验收，工具可能自动跳过域名检查。

使用现有平台账号；没有默认演示密码。账号由后端的 `industrial_api.create_user` 创建，见仓库 README。运行态只读取已发布版本；没有发布时在电脑端先发布 `demo`。地址参数 `pageId` 可查看其他已发布画面，历史入口在没有活动告警时仍可用。

H5 用于浏览器比较布局和本地 API 联调：

```bash
pnpm dev:miniprogram:h5
```

访问 `http://127.0.0.1:5174/mobile/`。H5 使用浏览器 Cookie，小程序使用独立 Bearer 会话；H5 通过不代表小程序网络栈通过。

## 后端地址

默认 `http://127.0.0.1:8000`。连接远程后端（必须包含本次 API 认证改动）：

```bash
VITE_API_ORIGIN=https://你的后端域名 pnpm build:miniprogram
```

生产使用 HTTPS / WSS，并在微信后台配置 request 和 socket 合法域名。修改 `src/manifest.json` 中的微信 AppID 后重新构建。`127.0.0.1` 在真机上指手机自身，不能连接电脑后端。

服务端 `AUTH_ALLOWED_ORIGINS` 应包含 Web 站点及小程序 Socket 使用的 API Origin。本机默认允许 5173、5174、4173、4174 与 8000；微信工具 Socket 实测 Origin 为 API 的 `http://127.0.0.1:8000`。不关闭后端来源校验。

## 会话与数据边界

- 小程序 `POST /api/auth/mini/login` 返回 `mini_` 前缀的随机会话；本地仅存会话令牌，不存密码。HTTP/Socket 通过 Authorization 头传输，URL 不含令牌，数据库只存哈希。浏览器 Cookie 不接受该令牌，浏览器会话也不能通过 Bearer 使用。
- 会话八小时过期、退出撤销、同端重新登录轮换；HTTP 与 Socket 共享校验，服务端失效后关闭旧 Socket。401 返回登录并保留目标页面，网络失败保留身份。
- 隐藏/卸载页面时停止订阅，返回前台复验身份、发布版本，重建连接。重连快照使用服务器观测年龄；旧观测不会被当成新数据。
- 页面版本变化暂停旧数据订阅、提示手动刷新；历史分页固定查询截止时间，版本不符拒绝混用。告警恢复/数据过期时禁用新分析，缺失观测不宣称设备正常。
- 趋势图本次不移植，提示在电脑端查看；不存在长期历史曲线。历史仅为当前发布版本内最近24小时模拟观测所证实的完整事件。
- Agent 产品帮助、扫码、通知、巡检表单、设备控制不在本次实现范围。

## 检查

```bash
pnpm test:miniprogram
pnpm --filter @industrial/miniprogram typecheck
pnpm build:miniprogram
pnpm --filter @industrial/miniprogram build:h5
pnpm test:api
```

验收记录见 `.scratch/miniprogram/acceptance.md`。真实模型、微信真机、HTTPS/WSS 和正式发布需分别验收，不包含在普通测试中。

## 面试在线展示

生产入口为 `https://industrial.everdojo.cn/mobile/`。H5 默认同源调用 API / WebSocket；构建资源路径固定在 /mobile/，随现有 Web 镜像发布。微信小程序仍通过 VITE_API_ORIGIN 指定 HTTPS 后端。

演示账号采用 viewer 角色，服务端拒绝草稿读取、编辑与发布。管理员创建命令：`python -m industrial_api.create_user interviewer --role viewer`；不要分享 editor 账号。保留已有平台登录界面，使用现有退出、过期及重试行为。
