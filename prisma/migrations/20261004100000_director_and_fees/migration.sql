-- Owner explicitly selected EIT Admin as director on 2026-10-04.
UPDATE "User" SET role='DIRECTOR' WHERE id='01e8c04e-0928-42f6-a35c-871dcfa3b3b5' AND name='EIT Admin' AND role='ADMIN';
INSERT INTO "AuditLog" (id,"actorName",action,entity,"entityId",summary) VALUES ('a12e6997-40e8-489c-9fc2-64d5f12554c7','Владелец EIT','ROLE','User','01e8c04e-0928-42f6-a35c-871dcfa3b3b5','EIT Admin назначен директором по указанию владельца');
-- Infer established fees from the most recent nonzero base amount, preserving historical invoices.
UPDATE "Group" g SET "monthlyFee"=p."baseAmount" FROM (SELECT DISTINCT ON ("groupId") "groupId","baseAmount" FROM "Payment" WHERE "groupId" IS NOT NULL AND "baseAmount">0 AND status IN ('PAID','PARTIAL') ORDER BY "groupId","periodStart" DESC,"createdAt" DESC) p WHERE g.id=p."groupId";
