-- CreateTable
CREATE TABLE "search_queries_log" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" TEXT,
    "resultsCount" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_log_pkey" PRIMARY KEY ("id")
);
