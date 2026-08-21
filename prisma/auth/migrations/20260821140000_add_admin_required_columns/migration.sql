ALTER TABLE `groups`
    ADD COLUMN `description` TEXT NULL;

ALTER TABLE `central_sessions`
    ADD COLUMN `user_agent` TEXT NULL;
