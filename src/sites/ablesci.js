/**
 * 科研通 (AblesCI) 签到模块
 * 使用账号密码自动登录，彻底解决 Cookie 过期问题
 */

import logger from '../utils/logger.js'

const BASE_URL = 'https://www.ablesci.com'
const LOGIN_URL = `${BASE_URL}/site/login`
const SIGN_URL = `${BASE_URL}/user/sign`

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'X-Requested-With': 'XMLHttpRequest'
}

/**
 * 从响应中提取 Cookie
 */
function extractCookies(response) {
  const setCookies = response.headers.getSetCookie?.() || []
  if (setCookies.length === 0) {
    // 兼容旧版 Node.js
    const raw = response.headers.get('set-cookie')
    if (raw) {
      return raw.split(',').map(c => c.split(';')[0].trim()).join('; ')
    }
    return ''
  }
  return setCookies.map(c => c.split(';')[0]).join('; ')
}

/**
 * 获取 CSRF Token
 */
async function getCsrfToken() {
  const response = await fetch(BASE_URL, {
    headers: DEFAULT_HEADERS
  })

  const html = await response.text()
  const cookies = extractCookies(response)

  // 从 HTML 中提取 CSRF token (meta 标签或 input 隐藏字段)
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/) ||
                    html.match(/name="_csrf"\s+value="([^"]+)"/) ||
                    html.match(/"csrfParam":"_csrf","csrfToken":"([^"]+)"/)

  return {
    csrf: csrfMatch ? csrfMatch[1] : null,
    cookies
  }
}

/**
 * 执行登录
 */
async function login(email, password) {
  logger.info('[科研通] 获取 CSRF Token...')

  const { csrf, cookies: initialCookies } = await getCsrfToken()

  logger.info('[科研通] 执行登录...')

  const formData = new URLSearchParams()
  formData.append('email', email)
  formData.append('password', password)
  if (csrf) {
    formData.append('_csrf', csrf)
  }

  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': initialCookies,
      'Referer': BASE_URL
    },
    body: formData.toString(),
    redirect: 'manual'
  })

  // 获取登录后的 Cookie
  const newCookies = extractCookies(response)
  const allCookies = [initialCookies, newCookies].filter(Boolean).join('; ')

  // 检查登录结果
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    // 如果不是 JSON，可能是重定向成功
    if (response.status === 302 || response.status === 200) {
      return { success: true, cookies: allCookies }
    }
    throw new Error('登录响应格式异常')
  }

  // 检查响应中的错误信息
  if (data.code === 0 || data.success) {
    return { success: true, cookies: allCookies }
  }

  throw new Error(data.message || data.msg || '登录失败')
}

/**
 * 执行签到
 */
async function doSign(cookies) {
  logger.info('[科研通] 执行签到...')

  // 访问首页获取 CSRF token
  const pageResponse = await fetch(BASE_URL, {
    headers: {
      ...DEFAULT_HEADERS,
      'Cookie': cookies
    }
  })
  const pageHtml = await pageResponse.text()

  // 提取 CSRF token
  const csrfMatch = pageHtml.match(/name="csrf-token"\s+content="([^"]+)"/) ||
                    pageHtml.match(/content="([^"]+)"\s+name="csrf-token"/) ||
                    pageHtml.match(/"csrfToken":"([^"]+)"/)
  const csrf = csrfMatch ? csrfMatch[1] : ''

  // 构建签到请求
  const formData = new URLSearchParams()
  if (csrf) {
    formData.append('_csrf', csrf)
  }

  const response = await fetch(SIGN_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': `${BASE_URL}/user/index`,
      'X-CSRF-Token': csrf  // 也在 header 中发送
    },
    body: formData.toString()
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    // 尝试从 HTML 中提取信息
    if (text.includes('签到成功') || text.includes('已签到') || text.includes('success')) {
      return { success: true, message: '签到成功' }
    }
    if (text.includes('已经签到') || text.includes('重复签到')) {
      return { success: true, message: '今日已签到' }
    }
    throw new Error('签到响应格式异常')
  }

  const msg = data.message || data.msg || ''

  // 解析签到结果
  if (data.code === 0 || data.success || data.status === 'success') {
    // 优先从 data 字段获取，其次从消息中提取
    let points = data.data?.signpoint || data.data?.points || data.points || 0
    let days = data.data?.signcount || data.data?.days || data.days || 0

    // 从消息中提取（备选）
    if (!points) {
      const pointsMatch = msg.match(/(\d+)\s*积分/)
      points = pointsMatch ? parseInt(pointsMatch[1]) : 0
    }
    if (!days) {
      const daysMatch = msg.match(/连续签到\s*(\d+)/)
      days = daysMatch ? parseInt(daysMatch[1]) : 0
    }

    return { success: true, message: '签到成功', points, days }
  }

  // 检查是否已签到
  if (msg.includes('已签') || msg.includes('已经签到') || msg.includes('重复') ||
      msg.includes('今天已') || msg.includes('已于')) {
    return { success: true, message: '今日已签到' }
  }

  throw new Error(msg || '签到失败')
}

/**
 * 获取用户信息（积分、连续签到天数等）
 */
async function getUserInfo(cookies) {
  try {
    // 访问积分页面获取详细信息
    const response = await fetch(`${BASE_URL}/my/point`, {
      headers: {
        ...DEFAULT_HEADERS,
        'Cookie': cookies,
        'Accept': 'text/html,application/xhtml+xml'
      }
    })

    const html = await response.text()

    // 尝试从页面提取积分和签到信息
    // 格式: "当前拥有 1128 积分" 和 "已连续签到 1 天"
    const pointsMatch = html.match(/当前拥有\s*(\d+)\s*积分/) ||
                        html.match(/总积分为[：:\s]*[^\d]*(\d+)/) ||
                        html.match(/(\d+)\s*积分/)
    const daysMatch = html.match(/已连续签到\s*(\d+)\s*天/) ||
                      html.match(/连续签到\s*(\d+)/)

    return {
      points: pointsMatch ? parseInt(pointsMatch[1]) : 0,
      days: daysMatch ? parseInt(daysMatch[1]) : 0
    }
  } catch (error) {
    return { points: 0, days: 0 }
  }
}

/**
 * 科研通签到入口
 * @returns {Promise<Object>} 签到结果
 */
export async function checkIn() {
  const email = process.env.ABLESCI_EMAIL
  const password = process.env.ABLESCI_PASSWORD

  if (!email || !password) {
    logger.warn('[科研通] 未配置 ABLESCI_EMAIL 或 ABLESCI_PASSWORD，跳过签到')
    return null
  }

  try {
    // 1. 登录
    const loginResult = await login(email, password)
    if (!loginResult.success) {
      throw new Error('登录失败')
    }
    logger.info('[科研通] 登录成功')

    // 2. 签到
    const signResult = await doSign(loginResult.cookies)
    logger.info(`[科研通] ${signResult.message}`)

    // 3. 获取用户信息
    const userInfo = await getUserInfo(loginResult.cookies)

    // 组装结果
    const details = []
    if (signResult.points || userInfo.points) {
      details.push(`积分: ${signResult.points || userInfo.points}`)
    }
    if (signResult.days || userInfo.days) {
      details.push(`连续签到: ${signResult.days || userInfo.days}天`)
    }

    return {
      siteName: '科研通',
      success: true,
      message: signResult.message,
      details: details.length > 0 ? details.join(', ') : null
    }

  } catch (error) {
    logger.error('[科研通] 签到失败:', error.message)

    // 检查是否是验证码问题
    const isVerifyError = error.message.includes('验证码') ||
                          error.message.includes('verify') ||
                          error.message.includes('captcha')

    return {
      siteName: '科研通',
      success: false,
      message: error.message,
      needAction: isVerifyError,
      actionMessage: isVerifyError ? '触发验证码，请手动登录一次' : null
    }
  }
}

export default { checkIn }
