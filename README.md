# 统一自动签到框架

基于 GitHub Actions 的多网站自动签到工具，支持邮件通知。

## 支持的网站

| 网站 | 认证方式 | Cookie 过期问题 |
|------|----------|-----------------|
| 科研通 (ablesci.com) | 账号密码自动登录 | ✅ 已解决 |
| HIFITI (hifiti.com) | Cookie | ⚠️ 过期时邮件提醒 |

## 快速开始

### 1. Fork 本仓库

点击右上角的 Fork 按钮。

### 2. 配置 Secrets

进入仓库 Settings → Secrets and variables → Actions，添加以下 Secrets：

#### 科研通配置
| Secret | 说明 |
|--------|------|
| `ABLESCI_EMAIL` | 科研通登录邮箱 |
| `ABLESCI_PASSWORD` | 科研通登录密码 |

#### HIFITI 配置
| Secret | 说明 |
|--------|------|
| `HIFITI_ACCOUNTS` | HIFITI 账号 JSON，格式见下方 |

```json
[
  {
    "name": "主账号",
    "cookie": "bbs_token=xxx; bbs_sid=xxx"
  }
]
```

**获取 Cookie 方法**：
1. 登录 hifiti.com
2. 打开浏览器开发者工具 (F12)
3. 切换到 Network 标签
4. 刷新页面，点击任意请求
5. 在 Headers 中找到 Cookie，复制 `bbs_token` 和 `bbs_sid` 的值

**注意**：使用网站右上角的"退出"按钮会使 Cookie 失效！

#### 邮件通知配置
| Secret | 说明 |
|--------|------|
| `SMTP_USER` | QQ 邮箱账号 (如 123456@qq.com) |
| `SMTP_PASS` | QQ 邮箱授权码 (非登录密码) |
| `MAIL_TO` | 接收通知的邮箱 |

**获取 QQ 邮箱授权码**：
1. 登录 mail.qq.com
2. 设置 → 账户 → POP3/SMTP服务
3. 开启服务并生成授权码

### 3. 配置通知模式 (可选)

进入 Settings → Secrets and variables → Actions → Variables，添加：

| Variable | 值 | 说明 |
|----------|-----|------|
| `NOTIFY_MODE` | `always` 或 `on_failure` | 默认 `always` |

- `always`: 每天都发送签到报告
- `on_failure`: 仅在签到失败或需要处理时发送

### 4. 启用 Actions

进入仓库的 Actions 标签，点击 "I understand my workflows, go ahead and enable them"。

### 5. 手动测试

点击 Actions → Auto Checkin → Run workflow，手动触发一次测试。

## 定时执行

默认每天北京时间 **8:00** 自动执行签到。

如需修改时间，编辑 `.github/workflows/checkin.yml` 中的 cron 表达式：

```yaml
schedule:
  - cron: "0 0 * * *"  # UTC 0:00 = 北京时间 8:00
```

**常用时间对照**：
| 北京时间 | UTC 时间 | Cron 表达式 |
|----------|----------|-------------|
| 08:00 | 00:00 | `0 0 * * *` |
| 09:00 | 01:00 | `0 1 * * *` |
| 21:00 | 13:00 | `0 13 * * *` |

## 邮件通知示例

### 全部成功
```
主题: ✅ 自动签到报告 - 2024-01-15

✅ 科研通: 签到成功 (积分: 100, 连续签到: 7天)
✅ HIFITI (主账号): 签到成功
```

### 需要处理
```
主题: ⚠️ 自动签到报告 - 需要注意

✅ 科研通: 签到成功
⚠️ HIFITI (主账号): Cookie已过期

🔧 需要处理:
请登录 hifiti.com 获取新 Cookie，更新 GitHub Secrets
```

## 注意事项

1. **GitHub Actions 60天限制**：仓库 60 天无活动会自动禁用定时任务，需手动重新启用

2. **HIFITI Cookie 有效期**：Cookie 会过期，过期时会收到邮件提醒，需手动更新

3. **科研通验证码**：正常情况下无需验证码，如果频繁登录失败可能触发验证码

## 本地开发

```bash
# 安装依赖
npm install

# 设置环境变量
export ABLESCI_EMAIL="your_email"
export ABLESCI_PASSWORD="your_password"
export HIFITI_ACCOUNTS='[{"name":"test","cookie":"..."}]'
export SMTP_USER="your_qq@qq.com"
export SMTP_PASS="your_auth_code"
export MAIL_TO="receive@example.com"

# 运行
npm start
```

## 项目结构

```
auto-sign-unified/
├── .github/
│   └── workflows/
│       └── checkin.yml      # GitHub Actions 工作流
├── src/
│   ├── index.js             # 主入口
│   ├── mailer.js            # 邮件通知
│   ├── sites/
│   │   ├── ablesci.js       # 科研通签到
│   │   └── hifiti.js        # HIFITI签到
│   └── utils/
│       └── logger.js        # 日志工具
├── package.json
└── README.md
```

## 添加新网站

1. 在 `src/sites/` 下创建新文件，如 `newsite.js`
2. 实现 `checkIn()` 函数，返回格式：
   ```javascript
   {
     siteName: '网站名',
     success: true/false,
     message: '签到结果',
     details: '额外信息（可选）',
     needAction: false,  // 是否需要用户处理
     actionMessage: ''   // 处理提示
   }
   ```
3. 在 `src/index.js` 中导入并调用

## License

MIT
