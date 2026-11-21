# 字母点唱机连接验证

Render 免费 Web Service 的只读连接验证服务，尚未接管正式注册。不会收集密码、代理用户请求、迁移曲库或存储用户数据。

- Root Directory: `connectivity`
- Runtime: Node.js
- Build Command: `node --check server.mjs && node --test test.mjs`
- Start Command: `node server.mjs`
- Health Check Path: `/health`
- Plan: Free
- Region: Singapore（无现有关联服务）

`GET /check` 仅请求固定的原站公开 `/api/version`，不转发浏览器 Cookie、Authorization 或用户提交的参数。10 秒内合并请求，失败只返回脱敏状态。

网页及只读测试成功后，还需要国内外实际手机验证此地址的可达性，再设计正式账号接入。Render Free 的休眠及资源限制仍适用。本服务不使用数据库或临时磁盘存放正式数据。
