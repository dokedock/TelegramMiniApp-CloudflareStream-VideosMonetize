-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telegramUserId` BIGINT NOT NULL,
    `username` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `languageCode` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_telegramUserId_key`(`telegramUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Video` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `cloudflareVideoUid` VARCHAR(191) NOT NULL,
    `priceCents` INTEGER NOT NULL,
    `currency` VARCHAR(16) NOT NULL DEFAULT 'USD',
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderCode` VARCHAR(32) NOT NULL,
    `userId` INTEGER NOT NULL,
    `videoId` INTEGER NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(16) NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `provider` VARCHAR(64) NOT NULL DEFAULT 'mock',
    `providerPaymentId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderCode_key`(`orderCode`),
    INDEX `Order_userId_idx`(`userId`),
    INDEX `Order_videoId_idx`(`videoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Entitlement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `videoId` INTEGER NOT NULL,
    `orderId` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Entitlement_orderId_key`(`orderId`),
    INDEX `Entitlement_userId_idx`(`userId`),
    INDEX `Entitlement_videoId_idx`(`videoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlaySession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionCode` VARCHAR(32) NOT NULL,
    `userId` INTEGER NOT NULL,
    `videoId` INTEGER NOT NULL,
    `orderId` INTEGER NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `tokenExpiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NULL,

    UNIQUE INDEX `PlaySession_sessionCode_key`(`sessionCode`),
    INDEX `PlaySession_userId_idx`(`userId`),
    INDEX `PlaySession_videoId_idx`(`videoId`),
    INDEX `PlaySession_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `playSessionId` INTEGER NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `playbackPositionSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlayEvent_playSessionId_idx`(`playSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_videoId_fkey` FOREIGN KEY (`videoId`) REFERENCES `Video`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entitlement` ADD CONSTRAINT `Entitlement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entitlement` ADD CONSTRAINT `Entitlement_videoId_fkey` FOREIGN KEY (`videoId`) REFERENCES `Video`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entitlement` ADD CONSTRAINT `Entitlement_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaySession` ADD CONSTRAINT `PlaySession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaySession` ADD CONSTRAINT `PlaySession_videoId_fkey` FOREIGN KEY (`videoId`) REFERENCES `Video`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlaySession` ADD CONSTRAINT `PlaySession_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayEvent` ADD CONSTRAINT `PlayEvent_playSessionId_fkey` FOREIGN KEY (`playSessionId`) REFERENCES `PlaySession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
