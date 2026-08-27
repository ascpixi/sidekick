-- CreateTable
CREATE TABLE "HackatimeCache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "hackatimeUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HackatimeCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "HackatimeCache_expiresAt_idx" ON "HackatimeCache"("expiresAt");

-- CreateIndex
CREATE INDEX "HackatimeCache_hackatimeUserId_idx" ON "HackatimeCache"("hackatimeUserId");
