/**
 * 统一自动签到框架 - 主入口
 */

import logger from './utils/logger.js'
import { sendEmail } from './mailer.js'
import { checkIn as ableSciCheckIn } from './sites/ablesci.js'
import { checkIn as hifitiCheckIn } from './sites/hifiti.js'

/**
 * 主函数
 */
async function main() {
  logger.info('========== 自动签到开始 ==========')

  const results = []

  // 1. 科研通签到
  try {
    const ableSciResult = await ableSciCheckIn()
    if (ableSciResult) {
      results.push(ableSciResult)
    }
  } catch (error) {
    logger.error('科研通签到异常:', error.message)
    results.push({
      siteName: '科研通',
      success: false,
      message: `异常: ${error.message}`
    })
  }

  // 2. HIFITI 签到（可能有多个账号）
  try {
    const hifitiResults = await hifitiCheckIn()
    results.push(...hifitiResults)
  } catch (error) {
    logger.error('HIFITI签到异常:', error.message)
    results.push({
      siteName: 'HIFITI',
      success: false,
      message: `异常: ${error.message}`
    })
  }

  // 3. 输出结果汇总
  logger.info('========== 签到结果汇总 ==========')
  for (const result of results) {
    const icon = result.success ? '✅' : '❌'
    logger.info(`${icon} ${result.siteName}: ${result.message}`)
    if (result.details) {
      logger.info(`   ${result.details}`)
    }
  }

  // 4. 发送邮件通知
  const notifyMode = process.env.NOTIFY_MODE || 'always'
  const hasFailure = results.some(r => !r.success)
  const hasWarning = results.some(r => r.needAction)

  if (results.length === 0) {
    logger.warn('没有配置任何签到任务，跳过邮件通知')
  } else if (notifyMode === 'always' || hasFailure || hasWarning) {
    logger.info('发送邮件通知...')
    await sendEmail(results)
  } else {
    logger.info('所有签到成功，通知模式为 on_failure，跳过邮件发送')
  }

  logger.info('========== 自动签到结束 ==========')

  // 如果有失败，退出码设为 1
  if (hasFailure) {
    process.exit(1)
  }
}

// 运行
main().catch(error => {
  logger.error('程序运行异常:', error)
  process.exit(1)
})
