ALTER TABLE `application_groups`
    ADD COLUMN `effect` ENUM('allow') NOT NULL DEFAULT 'allow';

ALTER TABLE `central_sessions`
    ADD COLUMN `ip_address` VARCHAR(45) NULL;

ALTER TABLE `user_groups`
    ADD COLUMN `id` CHAR(36) NULL,
    ADD COLUMN `created_at` DATETIME(3) NULL;

UPDATE `user_groups`
SET `id` = UUID(), `created_at` = `assigned_at`;

ALTER TABLE `user_groups`
    DROP PRIMARY KEY,
    MODIFY `id` CHAR(36) NOT NULL,
    MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    DROP COLUMN `assigned_at`,
    ADD PRIMARY KEY (`id`),
    ADD UNIQUE INDEX `user_groups_user_id_group_id_key` (`user_id`, `group_id`);

ALTER TABLE `application_groups`
    ADD COLUMN `id` CHAR(36) NULL,
    ADD COLUMN `created_at` DATETIME(3) NULL;

UPDATE `application_groups`
SET `id` = UUID(), `created_at` = `assigned_at`;

ALTER TABLE `application_groups`
    DROP PRIMARY KEY,
    MODIFY `id` CHAR(36) NOT NULL,
    MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    DROP COLUMN `assigned_at`,
    ADD PRIMARY KEY (`id`),
    ADD UNIQUE INDEX `application_groups_application_id_group_id_key` (`application_id`, `group_id`);

ALTER TABLE `authorization_codes`
    RENAME COLUMN `issued_at` TO `created_at`;
