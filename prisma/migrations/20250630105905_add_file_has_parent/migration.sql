-- AlterTable
ALTER TABLE "files" ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "files_parent_id_idx" ON "files"("parent_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
