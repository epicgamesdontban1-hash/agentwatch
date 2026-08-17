'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVELS[process.env.LOG_LEVEL] !== undefined
  ? LEVELS[process.env.LOG_LEVEL]
  : LEVELS.info;

function emit(level, label, args) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`${ts} [${label}]`, ...args);
}

module.exports = {
  debug: (...args) => emit('debug', 'DEBUG', args),
  info: (...args) => emit('info', 'INFO', args),
  warn: (...args) => emit('warn', 'WARN', args),
  error: (...args) => emit('error', 'ERROR', args),
};
