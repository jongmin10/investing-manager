-- CreateTable
CREATE TABLE "Guru" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fund" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GuruHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guruId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "cusip" TEXT NOT NULL,
    "ticker" TEXT,
    "company" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "value" REAL NOT NULL,
    "portfolioPct" REAL,
    "changeType" TEXT,
    "changePct" REAL,
    CONSTRAINT "GuruHolding_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Guru_cik_key" ON "Guru"("cik");

-- CreateIndex
CREATE INDEX "GuruHolding_guruId_quarter_idx" ON "GuruHolding"("guruId", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "GuruHolding_guruId_quarter_cusip_key" ON "GuruHolding"("guruId", "quarter", "cusip");
