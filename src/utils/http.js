/**
 * HTTP 工具函数
 * 提供带超时控制的 fetch 封装
 */

const DEFAULT_TIMEOUT = 15000 // 15秒超时

/**
 * 带超时控制的 fetch
 * @param {string} url - 请求 URL
 * @param {Object} options - fetch 选项
 * @param {number} timeout - 超时时间（毫秒），默认 15000
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout}ms): ${url}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export default { fetchWithTimeout }
