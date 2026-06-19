-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "sector" TEXT,
    "yahooSymbol" TEXT NOT NULL,
    "dartCode" TEXT
);

-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "high52w" REAL NOT NULL,
    "low52w" REAL NOT NULL,
    "changeRate" REAL,
    "marketCap" REAL,
    "per" REAL,
    "pbr" REAL,
    "volume" REAL,
    "avgVolume20d" REAL,
    CONSTRAINT "StockSnapshot_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockFinancial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "revenue" REAL,
    "operatingProfit" REAL,
    "netIncome" REAL,
    "revenueGrowth" REAL,
    "opGrowth" REAL,
    "netGrowth" REAL,
    "opMargin" REAL,
    CONSTRAINT "StockFinancial_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StockSnapshot_date_idx" ON "StockSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockSnapshot_stockId_date_key" ON "StockSnapshot"("stockId", "date");

-- CreateIndex
CREATE INDEX "StockFinancial_stockId_idx" ON "StockFinancial"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "StockFinancial_stockId_period_key" ON "StockFinancial"("stockId", "period");
