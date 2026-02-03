import pino from 'pino';

const level = process.env.LOG_LEVEL || process.env.WS2_LOG_LEVEL || 'info';

const logger = pino({
  level,
  base: null,
  timestamp: () => `,"time":"${new Date().toISOString()}"`
});

export default logger;
export const child = (bindings = {}) => logger.child(bindings);
