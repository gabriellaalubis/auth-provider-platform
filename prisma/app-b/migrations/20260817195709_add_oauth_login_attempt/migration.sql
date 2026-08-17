-- CreateTable
CREATE TABLE `oauth_login_attempts` (
    `id` CHAR(36) NOT NULL,
    `state_hash` CHAR(64) NOT NULL,
    `code_verifier` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `oauth_login_attempts_state_hash_key`(`state_hash`),
    INDEX `oauth_login_attempts_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
