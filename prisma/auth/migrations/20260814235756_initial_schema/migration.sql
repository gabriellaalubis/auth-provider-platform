CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `password_changed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `groups` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `groups_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_groups` (
    `user_id` CHAR(36) NOT NULL,
    `group_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_groups_group_id_idx`(`group_id`),
    PRIMARY KEY (`user_id`, `group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `applications` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret_hash` VARCHAR(255) NOT NULL,
    `redirect_uri` VARCHAR(2048) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `applications_client_id_key`(`client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `application_groups` (
    `application_id` CHAR(36) NOT NULL,
    `group_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `application_groups_group_id_idx`(`group_id`),
    PRIMARY KEY (`application_id`, `group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `central_sessions` (
    `id` CHAR(36) NOT NULL,
    `session_token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `status` ENUM('active', 'expired', 'revoked') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `last_activity_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoke_reason` VARCHAR(191) NULL,

    UNIQUE INDEX `central_sessions_session_token_hash_key`(`session_token_hash`),
    INDEX `central_sessions_user_id_status_idx`(`user_id`, `status`),
    INDEX `central_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `authorization_codes` (
    `id` CHAR(36) NOT NULL,
    `code_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `application_id` CHAR(36) NOT NULL,
    `central_session_id` CHAR(36) NOT NULL,
    `redirect_uri` VARCHAR(2048) NOT NULL,
    `code_challenge` VARCHAR(128) NOT NULL,
    `code_challenge_method` VARCHAR(16) NOT NULL DEFAULT 'S256',
    `status` ENUM('active', 'used', 'expired') NOT NULL DEFAULT 'active',
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,

    UNIQUE INDEX `authorization_codes_code_hash_key`(`code_hash`),
    INDEX `authorization_codes_application_id_status_expires_at_idx`(`application_id`, `status`, `expires_at`),
    INDEX `authorization_codes_central_session_id_idx`(`central_session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `access_tokens` (
    `id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `application_id` CHAR(36) NOT NULL,
    `central_session_id` CHAR(36) NOT NULL,
    `scopes` JSON NULL,
    `status` ENUM('active', 'expired', 'revoked') NOT NULL DEFAULT 'active',
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `access_tokens_token_hash_key`(`token_hash`),
    INDEX `access_tokens_application_id_status_expires_at_idx`(`application_id`, `status`, `expires_at`),
    INDEX `access_tokens_central_session_id_idx`(`central_session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `application_id` CHAR(36) NULL,
    `session_id` CHAR(36) NULL,
    `result` VARCHAR(64) NOT NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_event_type_created_at_idx`(`event_type`, `created_at`),
    INDEX `audit_logs_actor_id_idx`(`actor_id`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `events` (
    `id` CHAR(36) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `central_session_id` CHAR(36) NULL,
    `application_id` CHAR(36) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'published', 'failed') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_at` DATETIME(3) NULL,

    INDEX `events_status_created_at_idx`(`status`, `created_at`),
    INDEX `events_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `event_deliveries` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `application_id` CHAR(36) NOT NULL,
    `status` ENUM('pending', 'processing', 'succeeded', 'retrying', 'failed') NOT NULL DEFAULT 'pending',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `last_attempt_at` DATETIME(3) NULL,
    `next_retry_at` DATETIME(3) NULL,
    `processed_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,

    INDEX `event_deliveries_status_next_retry_at_idx`(`status`, `next_retry_at`),
    INDEX `event_deliveries_application_id_idx`(`application_id`),
    UNIQUE INDEX `event_deliveries_event_id_application_id_key`(`event_id`, `application_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_groups` ADD CONSTRAINT `user_groups_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_groups` ADD CONSTRAINT `user_groups_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `application_groups` ADD CONSTRAINT `application_groups_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `application_groups` ADD CONSTRAINT `application_groups_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `central_sessions` ADD CONSTRAINT `central_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `authorization_codes` ADD CONSTRAINT `authorization_codes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `authorization_codes` ADD CONSTRAINT `authorization_codes_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `authorization_codes` ADD CONSTRAINT `authorization_codes_central_session_id_fkey` FOREIGN KEY (`central_session_id`) REFERENCES `central_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `access_tokens` ADD CONSTRAINT `access_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `access_tokens` ADD CONSTRAINT `access_tokens_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `access_tokens` ADD CONSTRAINT `access_tokens_central_session_id_fkey` FOREIGN KEY (`central_session_id`) REFERENCES `central_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `central_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `events` ADD CONSTRAINT `events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `events` ADD CONSTRAINT `events_central_session_id_fkey` FOREIGN KEY (`central_session_id`) REFERENCES `central_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `events` ADD CONSTRAINT `events_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `event_deliveries` ADD CONSTRAINT `event_deliveries_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `event_deliveries` ADD CONSTRAINT `event_deliveries_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
