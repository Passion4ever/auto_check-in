/**
 * 简单的日志工具
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO

function formatTime() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}

function log(level, levelName, ...args) {
  if (level >= currentLevel) {
    console.log(`[${formatTime()}] [${levelName}]`, ...args)
  }
}

export const logger = {
  debug: (...args) => log(LOG_LEVELS.DEBUG, 'DEBUG', ...args),
  info: (...args) => log(LOG_LEVELS.INFO, 'INFO', ...args),
  warn: (...args) => log(LOG_LEVELS.WARN, 'WARN', ...args),
  error: (...args) => log(LOG_LEVELS.ERROR, 'ERROR', ...args)
}

export default logger
