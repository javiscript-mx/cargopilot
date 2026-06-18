-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'finance';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;
