/**
 * HIFITI 音乐磁场 签到模块
 * 使用 Cookie 认证，支持多账号，包含 Cookie 有效性检测
 * Cookie 过期时会邮件提醒用户更新
 */

import logger from '../utils/logger.js'

const BASE_URL = 'https://www.hifiti.com'
const SIGN_URL = `${BASE_URL}/sg_sign.htm`
const CHECK_URL = `${BASE_URL}/user.htm`
const SUCCESS_CODE = '0'

const DEFAULT_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

/**
 * 检测 Cookie 是否有效
 */
async function validateCookie(cookie) {
  try {
    const response = await fetch(CHECK_URL, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookie
      },
      redirect: 'manual'
    })

    // 如果被重定向到登录页，说明 Cookie 已过期
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location') || ''
      if (location.includes('login') || location.includes('signin')) {
        return { valid: false, reason: 'Cookie已过期，需要重新登录' }
      }
    }

    // 检查响应内容是否包含用户信息
    const text = await response.text()
    if (text.includes('请登录') || text.includes('user-login')) {
      return { valid: false, reason: 'Cookie已失效' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, reason: `验证失败: ${error.message}` }
  }
}

/**
 * 获取用户信息（金币等）
 */
async function getUserInfo(cookie) {
  try {
    const response = await fetch(`${BASE_URL}/my.htm`, {
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookie
      }
    })
    const html = await response.text()

    // 提取金币: 金币：21 或 金币: 21
    const coinsMatch = html.match(/金币[：:]\s*(\d+)/) ||
                       html.match(/金币<[^>]*>(\d+)/)

    return {
      coins: coinsMatch ? parseInt(coinsMatch[1]) : 0
    }
  } catch (error) {
    return { coins: 0 }
  }
}

/**
 * 执行签到
 */
async function doCheckIn(cookie) {
  const response = await fetch(SIGN_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      Cookie: cookie
    }
  })

  if (!response.ok) {
    throw new Error(`网络请求失败 - ${response.status}`)
  }

  const data = await response.json()

  if (data.code === SUCCESS_CODE) {
    return { success: true, message: data.message || '签到成功' }
  }

  if (data.message === '今天已经签过啦！' || data.message?.includes('已签')) {
    return { success: true, message: '今日已签到' }
  }

  throw new Error(data.message || '签到失败')
}

/**
 * 单个账号签到
 */
async function checkInSingleAccount(account) {
  const { name, cookie } = account

  logger.info(`[HIFITI] 开始签到...`)

  // 先验证 Cookie
  const validation = await validateCookie(cookie)
  if (!validation.valid) {
    logger.warn(`[HIFITI] ${validation.reason}`)
    return {
      siteName: 'HIFITI',
      success: false,
      message: validation.reason,
      needAction: true,
      actionMessage: `请登录 hifiti.com 获取新 Cookie，更新 GitHub Secrets: HIFITI_ACCOUNTS`
    }
  }

  // 执行签到
  try {
    const result = await doCheckIn(cookie)
    logger.info(`[HIFITI] ${result.message}`)

    // 获取用户信息
    const userInfo = await getUserInfo(cookie)
    const details = userInfo.coins ? `金币: ${userInfo.coins}` : null

    return {
      siteName: 'HIFITI',
      success: true,
      message: result.message,
      details
    }
  } catch (error) {
    logger.error(`[HIFITI] ${error.message}`)
    return {
      siteName: 'HIFITI',
      success: false,
      message: error.message
    }
  }
}

/**
 * HIFITI 签到入口
 * @returns {Promise<Array>} 签到结果数组（支持多账号）
 */
export async function checkIn() {
  const accountsJson = process.env.HIFITI_ACCOUNTS

  if (!accountsJson) {
    logger.warn('[HIFITI] 未配置 HIFITI_ACCOUNTS，跳过签到')
    return []
  }

  let accounts
  try {
    accounts = JSON.parse(accountsJson)
  } catch (error) {
    logger.error('[HIFITI] HIFITI_ACCOUNTS 格式错误，请检查 JSON 格式')
    return [{
      siteName: 'HIFITI',
      success: false,
      message: 'HIFITI_ACCOUNTS 配置格式错误'
    }]
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    logger.warn('[HIFITI] 未配置任何账号')
    return []
  }

  // 并发处理所有账号
  const results = await Promise.all(
    accounts.map(account => checkInSingleAccount(account))
  )

  return results
}

export default { checkIn }
