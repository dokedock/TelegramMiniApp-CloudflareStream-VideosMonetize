-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorType` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(64) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entityType` VARCHAR(64) NOT NULL,
    `entityId` INTEGER NULL,
    `message` VARCHAR(255) NOT NULL,
    `metadata` TEXT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `ActivityLog_action_idx`(`action`),
    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
