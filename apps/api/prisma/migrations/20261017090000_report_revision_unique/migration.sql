-- DropIndex
DROP INDEX "Report_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "Report_number_revision_key" ON "Report"("number", "revision");

