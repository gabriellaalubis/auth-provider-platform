import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  MYSQL_ROOT_PASSWORD: Joi.string().min(1).required(),
  MYSQL_USER: Joi.string().min(1).required(),
  MYSQL_PASSWORD: Joi.string().min(1).required(),

  RABBITMQ_DEFAULT_USER: Joi.string().min(1).required(),
  RABBITMQ_DEFAULT_PASS: Joi.string().min(1).required(),

  AUTH_SERVER_PORT: Joi.number().port().default(3000),
  CONTROL_PANEL_PORT: Joi.number().port().default(3001),
  APP_A_PORT: Joi.number().port().default(4001),
  APP_B_PORT: Joi.number().port().default(4002),
  SYNC_WORKER_PORT: Joi.number().port().default(5000),

  SESSION_COOKIE_NAME: Joi.string().min(1).default('central_session'),
  SESSION_TTL_SECONDS: Joi.number().integer().positive().default(28800),
  SESSION_COOKIE_SECURE: Joi.boolean().default(false),

  AUTH_DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),
  APP_A_DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),
  APP_B_DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
  INTERNAL_LOGOUT_SECRET: Joi.string().min(32).max(256).required(),
  EVENT_QUEUE_NAME: Joi.string().min(1).default('sso.events'),
  EVENT_DLQ_NAME: Joi.string().min(1).default('sso.events.dlq'),
  EVENT_PUBLISH_INTERVAL_MS: Joi.number().integer().min(100).default(1000),
  EVENT_MAX_RETRIES: Joi.number().integer().min(1).max(10).default(5),
  EVENT_RETRY_BASE_MS: Joi.number().integer().min(100).default(1000),
  SHUTDOWN_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000),
  AUTHORIZATION_CODE_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(600)
    .default(300),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3600)
    .default(900),
  AUTH_SERVER_PUBLIC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  AUTH_SERVER_INTERNAL_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  APP_A_CLIENT_ID: Joi.string().min(1).required(),
  APP_A_CLIENT_SECRET: Joi.string().min(24).max(128).required(),
  APP_A_REDIRECT_URI: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  APP_A_LOCAL_SESSION_COOKIE_NAME: Joi.string().min(1).required(),
  APP_B_CLIENT_ID: Joi.string().min(1).required(),
  APP_B_CLIENT_SECRET: Joi.string().min(24).max(128).required(),
  APP_B_REDIRECT_URI: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  APP_B_LOCAL_SESSION_COOKIE_NAME: Joi.string().min(1).required(),
  LOCAL_SESSION_TTL_SECONDS: Joi.number().integer().min(300).default(28800),
  OAUTH_LOGIN_ATTEMPT_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(600)
    .default(300),
  MFA_CHALLENGE_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(600)
    .default(300),
});
