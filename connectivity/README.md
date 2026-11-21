# 字母点唱机账号连接服务

Render 免费 Web Service，提供固定来源的账号 API 连接与只读测试页。正式账号、密码哈希、曲库和唯一管理员继续保存在原 Sites 的 D1 数据库，不使用 Render 临时磁盘保存正式数据。

- Root Directory: `connectivity`
- Runtime: Node.js
- Build Command: `node --check server.mjs && node --test test.mjs`
- Start Command: `node server.mjs`
- Health Check Path: `/health`
- Plan: Free
- Region: Singapore
- Auto-deploy: Off；公开仓库代码变更后需要手动部署。

只允许 https://waizibushiyezi.github.io 的 API 来源及明确列出的路径与方法。上游固定为原站，不接受任意目标地址；不跟随重定向。不转发 Cookie 或来访者伪造的代理身份头，不缓存 API，不记录请求体、密码和会话。返回的随机会话继续绑定原 GitHub 来源。

原系统的认证、账号隔离、唯一管理员、同步冲突、公告与防猜测限流继续生效。Render 出口 IP 可能被上游汇总限流，扩大用户规模时需要设计经过认证的来源限流，不可直接信任客户端 IP 字段或取消防护。

免费服务有休眠和资源限制，前端为唤醒等待最多 90 秒，注册不自动重试。连接测试通过仅证明该时刻的链路，不能保证所有网络持续可用。
