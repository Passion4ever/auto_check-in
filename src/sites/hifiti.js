/**
 * HIFITI 音乐磁场 签到模块
 * 使用 Cookie 认证，支持多账号，包含 Cookie 有效性检测
 * Cookie 过期时会邮件提醒用户更新
 */

import * as cheerio from 'cheerio'
import logger from '../utils/logger.js'
import { fetchWithTimeout } from '../utils/http.js'

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
    const response = await fetchWithTimeout(CHECK_URL, {
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
    const isTimeout = error.message.includes('超时')
    return {
      valid: false,
      reason: isTimeout ? '验证超时，请检查网络' : `验证失败: ${error.message}`
    }
  }
}

/**
 * 使用 cheerio 从 HTML 中提取用户信息
 */
function extractUserInfo(html) {
  const $ = cheerio.load(html)

  // 提取金币: <span>金币:</span><b>21</b>
  // 或者: <span>金币:</span><b class="text-danger">21</b>
  let coins = 0

  // 方法1: 查找包含"金币"文本的 span 后面的 b 标签
  $('span').each((_, el) => {
    const text = $(el).text()
    if (text.includes('金币')) {
      const nextB = $(el).next('b')
      if (nextB.length) {
        coins = parseInt(nextB.text()) || 0
      } else {
        // 也可能是 span 内部有 b
        const innerB = $(el).find('b')
        if (innerB.length) {
          coins = parseInt(innerB.text()) || 0
        }
      }
    }
  })

  // 方法2: 如果上面没找到，尝试查找 text-danger 类的 b 标签
  if (!coins) {
    const dangerB = $('b.text-danger')
    if (dangerB.length) {
      coins = parseInt(dangerB.first().text()) || 0
    }
  }

  return { coins }
}

/**
 * 获取用户信息（金币等）
 */
async function getUserInfo(cookie) {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/my.htm`, {
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookie
      }
    })
    const html = await response.text()
    return extractUserInfo(html)
  } catch (error) {
    logger.debug(`[HIFITI] 获取用户信息失败: ${error.message}`)
    return { coins: 0 }
  }
}

/**
 * 执行签到
 */
async function doCheckIn(cookie) {
  const response = await fetchWithTimeout(SIGN_URL, {
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

    const isTimeout = error.message.includes('超时')
    return {
      siteName: 'HIFITI',
      success: false,
      message: error.message,
      actionMessage: isTimeout ? '网络超时，请稍后重试' : null
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
