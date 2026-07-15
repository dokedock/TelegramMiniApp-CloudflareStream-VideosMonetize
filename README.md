# Telegram Mini App + Cloudflare Stream 视频售卖系统

一个基于 **Telegram Mini App + Cloudflare Stream + Node.js + MySQL** 的私域视频售卖项目。项目提供视频商品管理、订单支付、观看权限、水印播放器、播放记录、后台运营、开发测试工具等完整本地开发闭环。

本项目适合用于学习、二次开发或搭建合规的视频内容付费访问系统。

## 法律风险与免责声明

本项目仅供合法合规用途使用。使用者必须确保所售卖、分发、存储、展示、传播的视频内容拥有合法版权、授权或其他合法权利，并遵守所在国家或地区的法律法规、平台规则、支付服务规则、Cloudflare 服务条款以及 Telegram 相关规则。

使用本项目产生的一切后果，包括但不限于版权纠纷、内容违规、支付纠纷、账户封禁、数据泄露、业务损失、法律责任、行政处罚、民事或刑事责任，均由使用者自行承担。

项目作者与贡献者不对任何直接、间接、偶然、特殊、惩罚性或后果性损失承担任何责任，也不对使用者通过本项目进行的任何行为承担责任。使用本项目即表示你理解并同意自行承担全部风险。

## 重要说明

- 播放器层水印、订单号水印、短时播放链接、播放 session 限制只能提高追踪和滥用成本，不能从技术上彻底阻止录屏、翻拍或二次传播。
- Telegram Mini App 前端运行在用户设备上，任何前端限制都不能视为绝对安全措施。
- 真正上线前需要配置 HTTPS 域名、Telegram Webhook、Cloudflare Stream 私密播放签名、强后台密码、数据库备份和日志监控。

## 功能特性

### 前台 Mini App

- 视频列表展示
- 视频价格展示
- 本地浏览器模拟购买
- Telegram Mini App 环境下支持 Telegram Payments 发票
- 已购买视频播放入口
- 播放器层官方水印
- 播放器层订单号水印
- 订单号水印随机移动
- 播放心跳上报
- 播放 session 创建
- 单用户并发播放限制
- 本地支付方式选择：
  - 模拟支付
  - 手动支付
  - USDT 占位
  - Stripe 占位

### 后台管理

- 管理员密码登录
- 运营概览
- Telegram Bot Token 配置和测试
- Telegram Payments 配置
- Cloudflare Stream 配置和测试
- Cloudflare Stream 视频拉取
- Cloudflare 视频导入本地视频库
- 视频创建、编辑、上架、下架、归档
- 支付方式管理
- 订单列表
- 订单筛选
- 订单详情
- 手动标记支付
- 手动发放权限
- 权限撤销和恢复
- 用户列表
- 用户搜索
- 用户详情
- 用户订单、权限、播放记录查看
- 播放 session 列表
- 播放 session 搜索
- 播放事件时间线
- 活动日志
- 开发工具：
  - 创建测试用户
  - 创建测试订单
  - 清理播放 session 和播放事件

### 后端能力

- Fastify API
- Telegram initData 校验
- 开发环境模拟 Telegram 用户
- Prisma + MySQL 数据模型
- Telegram Payments 发票创建
- Telegram Payment Webhook 处理
- Cloudflare Stream signed token 播放链接
- 活动日志记录
- 播放事件记录
- 订单权限发放
- 订单、用户、视频、播放记录筛选

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + Fastify
- 数据库：MySQL 8.0 + Prisma
- 视频：Cloudflare Stream
- 支付：Telegram Payments，外加本地模拟支付和占位支付方式
- 图标：lucide-react

## 目录结构

```text
.
├── backend
│   ├── prisma
│   │   ├── migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src
│       ├── admin.ts
│       ├── auth.ts
│       ├── cloudflare.ts
│       ├── payments.ts
│       ├── routes.ts
│       └── settings.ts
├── frontend
│   └── src
│       ├── AdminApp.tsx
│       ├── App.tsx
│       ├── api.ts
│       └── styles.css
├── DEVELOPMENT_FLOW.md
├── 开发流程.md
└── README.md
```

## 本地环境要求

```text
Node.js 20+
npm
MySQL 8.0
```

创建数据库：

```sql
CREATE DATABASE tgwebapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

复制环境变量：

```bash
cp .env.example .env
cp .env.example backend/.env
```

根据你的本地 MySQL 修改 `.env` 和 `backend/.env`：

```text
DATABASE_URL=mysql://root:你的密码@127.0.0.1:3306/tgwebapp
ADMIN_PASSWORD=admin123
```

安装依赖：

```bash
npm install
```

初始化数据库：

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

启动开发服务：

```bash
npm run dev
```

默认访问地址：

```text
前台：http://localhost:5173
后台：http://localhost:5173/admin
后端：http://localhost:8000
```

## 常用命令

```bash
npm run dev
npm run build
npm run typecheck
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

## 环境变量

主要环境变量：

```text
APP_ENV=development
PORT=8000
HOST=127.0.0.1
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_PASSWORD=admin123
DATABASE_URL=mysql://user:password@127.0.0.1:3306/tgwebapp

TELEGRAM_BOT_TOKEN=
TELEGRAM_PAYMENT_PROVIDER_TOKEN=
DEV_TELEGRAM_USER_ID=10001
DEV_TELEGRAM_USERNAME=devbuyer

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_STREAM_SIGNING_KEY_ID=
CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY=
TOKEN_TTL_SECONDS=900
DEMO_CLOUDFLARE_VIDEO_UID=

OFFICIAL_WATERMARK_TEXT=Official
MOCK_PAYMENTS=true
VITE_API_BASE_URL=http://localhost:8000
VITE_TELEGRAM_BOT_USERNAME=
```

真实密钥请只写入 `.env` 或后台配置，不要提交到 Git。

## 本地开发流程

本地普通浏览器没有 Telegram Mini App 的 `openInvoice` 环境，因此默认使用本地支付流程。

推荐测试顺序：

```text
后台创建或导入视频
  -> 前台选择支付方式并购买
  -> 后台订单页查看订单详情
  -> 待支付订单手动标记支付
  -> 前台刷新后播放
  -> 后台播放页查看 session 和事件
  -> 后台日志页查看完整操作记录
```

本地支付方式说明：

- 模拟支付：创建订单后立即标记为已支付，并自动发放观看权限。
- 手动支付：创建待支付订单，需要后台手动标记支付。
- USDT：当前为本地占位流程，创建待支付订单。
- Stripe：当前为本地占位流程，创建待支付订单。

## Telegram Payments

在 BotFather 中配置：

```text
/mybots -> 选择 Bot -> Bot Settings -> Payments
```

获取 Payment Provider Token 后，在后台“支付”页填写并启用 Telegram Payments。

支付链路：

```text
Mini App 点击购买
  -> 后端创建 PENDING 订单
  -> 后端调用 Telegram createInvoiceLink
  -> Mini App 调用 Telegram.WebApp.openInvoice
  -> Telegram 发送 pre_checkout_query 到 webhook
  -> 后端 answerPreCheckoutQuery
  -> Telegram 支付成功后发送 successful_payment
  -> 后端标记订单 PAID 并发放观看权限
```

正式环境需要给 Telegram Bot 配置 HTTPS Webhook：

```text
https://你的域名/api/telegram/webhook
```

## Cloudflare Stream

后台需要配置：

- Cloudflare Account ID
- Cloudflare API Token
- Stream Signing Key ID
- Stream Signing Private Key
- 默认测试视频 UID

未配置 Cloudflare signed key 时，系统会使用演示播放地址，方便先开发订单、水印和后台流程。

## 防转卖和风控设计

项目当前提供：

- 订单号水印
- 官方水印
- 播放 session 记录
- 播放心跳记录
- 播放事件时间线
- 单用户同时播放数量限制
- 后台用户详情和播放记录追踪
- 活动日志

注意：这些能力只能辅助追踪和提高滥用成本，不能保证视频不会被录屏、翻拍、下载、转卖或传播。

## 数据库模型

核心模型：

- User：Telegram 用户
- Video：视频商品
- Order：订单
- Entitlement：观看权限
- PlaySession：播放会话
- PlayEvent：播放事件
- AppSetting：后台配置
- ActivityLog：后台和系统活动日志

## 上线前检查

上线前至少需要完成：

- 配置 HTTPS 域名
- 配置 Telegram Mini App URL
- 配置 Telegram Bot Webhook
- 配置真实 Telegram Payment Provider Token
- 配置 Cloudflare Stream 私密播放
- 修改强后台密码
- 配置数据库备份
- 配置错误日志和访问日志
- 检查内容版权和销售合规性
- 检查支付服务地区、品类和平台规则

## 常见问题

### Body cannot be empty when content-type is set to application/json

请求设置了 `Content-Type: application/json`，但没有传 JSON body。GET 请求不要带 body；POST/PUT 请求需要传合法 JSON。

### 购买后没有权限

检查订单是否还是 `PENDING`。手动支付、USDT、Stripe 占位流程需要后台标记支付后才会发放权限。

### 播放被拒绝

可能触发了“单用户同时播放数”限制。可以在配置页临时改成 `0`，或在开发工具里清理播放 session。

### Cloudflare 未配置能不能测试

可以。未配置时会走本地演示播放器，不影响订单、权限、水印、播放 session 和后台流程测试。

## 许可证

本项目当前未附带开源许可证。未经项目所有者明确授权，不代表允许商业使用、再分发或修改发布。
