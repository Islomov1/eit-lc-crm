CREATE TYPE "LearningFormat" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');
ALTER TABLE "Lead" ADD COLUMN "learningFormat" "LearningFormat" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "LeadForm" ADD COLUMN "learningFormat" "LearningFormat" NOT NULL DEFAULT 'UNKNOWN';
