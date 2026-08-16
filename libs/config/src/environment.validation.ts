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
});
