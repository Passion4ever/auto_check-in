/**
 * 邮件通知模块 - 使用 QQ 邮箱 SMTP
 */

import nodemailer from 'nodemailer'
import logger from './utils/logger.js'

/**
 * 创建邮件传输器
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.qq.com'
  const port = parseInt(process.env.SMTP_PORT || '465')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!user || !pass) {
    throw new Error('邮件配置缺失：请设置 SMTP_USER 和 SMTP_PASS 环境变量')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  })
}

/**
 * 生成邮件 HTML 内容
 */
function generateEmailHtml(results) {
  const date = new Date().toLocaleDateString('zh-CN')
  const allSuccess = results.every(r => r.success)
  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h2 { margin: 0 0 20px 0; color: #333; }
    .result-item { padding: 12px; margin: 8px 0; border-radius: 8px; }
    .success { background: #e8f5e9; color: #2e7d32; }
    .warning { background: #fff3e0; color: #ef6c00; }
    .error { background: #ffebee; color: #c62828; }
    .summary { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
    .action-needed { margin-top: 20px; padding: 16px; background: #fff8e1; border-radius: 8px; }
    .action-needed h3 { margin: 0 0 12px 0; color: #f57c00; }
    .action-needed p { margin: 8px 0; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>${allSuccess ? '✅' : '⚠️'} 自动签到报告 - ${date}</h2>
`

  for (const result of results) {
    const statusClass = result.success ? 'success' : (result.needAction ? 'warning' : 'error')
    const icon = result.success ? '✅' : (result.needAction ? '⚠️' : '❌')

    html += `
    <div class="result-item ${statusClass}">
      <strong>${icon} ${result.siteName}</strong>: ${result.message}
      ${result.details ? `<br><small>${result.details}</small>` : ''}
    </div>
`
  }

  html += `
    <div class="summary">
      成功: ${successCount} | 失败: ${failCount}
    </div>
`

  // 添加需要处理的事项
  const actionsNeeded = results.filter(r => r.needAction)
  if (actionsNeeded.length > 0) {
    html += `
    <div class="action-needed">
      <h3>🔧 需要处理</h3>
`
    for (const action of actionsNeeded) {
      html += `
      <p><strong>${action.siteName}</strong>: ${action.actionMessage || action.message}</p>
`
    }
    html += `
    </div>
`
  }

  html += `
  </div>
</body>
</html>
`
  return html
}

/**
 * 发送签到结果邮件
 * @param {Array} results - 签到结果数组
 */
export async function sendEmail(results) {
  const mailTo = process.env.MAIL_TO
  const mailFrom = process.env.SMTP_USER

  if (!mailTo) {
    logger.warn('未配置 MAIL_TO，跳过邮件发送')
    return false
  }

  try {
    const transporter = createTransporter()
    const allSuccess = results.every(r => r.success)
    const date = new Date().toLocaleDateString('zh-CN')

    const subject = allSuccess
      ? `✅ 自动签到报告 - ${date}`
      : `⚠️ 自动签到报告 - ${date} - 需要注意`

    const info = await transporter.sendMail({
      from: mailFrom,
      to: mailTo,
      subject,
      html: generateEmailHtml(results)
    })

    logger.info(`邮件发送成功: ${info.messageId}`)
    return true
  } catch (error) {
    logger.error('邮件发送失败:', error.message)
    return false
  }
}

export default { sendEmail }
