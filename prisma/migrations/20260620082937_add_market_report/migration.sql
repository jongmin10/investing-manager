-- CreateTable
CREATE TABLE "MarketReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "kospi" REAL,
    "kospiChange" REAL,
    "kosdaq" REAL,
    "kosdaqChange" REAL,
    "krwUsd" REAL,
    "krwUsdChange" REAL,
    "sp500" REAL,
    "sp500Change" REAL,
    "vix" REAL,
    "us10y" REAL,
    "us10yChange" REAL,
    "summaryKr" TEXT,
    "summaryUs" TEXT,
    "insightDcIrp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketReport_date_key" ON "MarketReport"("date");
