/*
  Warnings:

  - You are about to drop the column `redirect_uri` on the `applications` table. All the data in the column will be lost.
  - Added the required column `logout_notification_url` to the `applications` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `applications` DROP COLUMN `redirect_uri`,
    ADD COLUMN `launch_url` VARCHAR(2048) NULL,
    ADD COLUMN `logout_notification_url` VARCHAR(2048) NOT NULL;

-- CreateTable
CREATE TABLE `application_redirect_uris` (
    `id` CHAR(36) NOT NULL,
    `application_id` CHAR(36) NOT NULL,
    `redirect_uri` VARCHAR(2048) NOT NULL,
    `redirect_uri_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `application_redirect_uris_application_id_redirect_uri_hash_key`(`application_id`, `redirect_uri_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application_redirect_uris` ADD CONSTRAINT `application_redirect_uris_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
