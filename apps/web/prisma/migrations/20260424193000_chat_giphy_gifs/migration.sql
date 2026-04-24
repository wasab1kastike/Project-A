CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'GIF');

ALTER TABLE "ChatMessage"
ADD COLUMN "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN "gifProvider" TEXT,
ADD COLUMN "gifProviderId" TEXT,
ADD COLUMN "gifTitle" TEXT,
ADD COLUMN "gifPreviewUrl" TEXT,
ADD COLUMN "gifDisplayUrl" TEXT,
ADD COLUMN "gifWidth" INTEGER,
ADD COLUMN "gifHeight" INTEGER,
ADD COLUMN "gifSourceUrl" TEXT;
