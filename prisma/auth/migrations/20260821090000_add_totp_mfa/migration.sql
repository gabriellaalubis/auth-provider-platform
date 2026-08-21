ALTER TABLE `users`
  ADD COLUMN `mfa_secret_encrypted` TEXT NULL,
  ADD COLUMN `mfa_enabled_at` DATETIME(3) NULL;

CREATE TABLE `mfa_login_challenges` (
  `id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `mfa_login_challenges_token_hash_key`(`token_hash`),
  INDEX `mfa_login_challenges_user_id_expires_at_idx`(`user_id`, `expires_at`),
  INDEX `mfa_login_challenges_expires_at_used_at_idx`(`expires_at`, `used_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `mfa_recovery_codes` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `mfa_recovery_codes_user_id_code_hash_key`(`user_id`, `code_hash`),
  INDEX `mfa_recovery_codes_user_id_used_at_idx`(`user_id`, `used_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mfa_login_challenges`
  ADD CONSTRAINT `mfa_login_challenges_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mfa_recovery_codes`
  ADD CONSTRAINT `mfa_recovery_codes_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
