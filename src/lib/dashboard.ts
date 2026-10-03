import { prisma } from "./prisma";
import { monthWindow } from "./format";
export async function debtSummary(month: string) {
  const { start, end } = monthWindow(month);
  const rows = await prisma.$queryRaw<
    { studentId: string; name: string; balance: bigint }[]
  >`
 WITH charges AS (
  SELECT s.id AS "studentId", s.name, CASE WHEN p.status IN ('VOID','REFUND') THEN 0 ELSE GREATEST(0, COALESCE(p.amount,g."monthlyFee")-COALESCE(p."paidAmount",0)) END AS balance
  FROM "Student" s JOIN "_GroupToStudent" gs ON gs."B"=s.id JOIN "Group" g ON g.id=gs."A"
  LEFT JOIN "Payment" p ON p."studentId"=s.id AND p."groupId"=g.id AND p."periodStart">=${start} AND p."periodStart"<${end}
  WHERE s."archivedAt" IS NULL AND g."archivedAt" IS NULL AND s."createdAt"<${end} AND g."createdAt"<${end}
  UNION ALL
  SELECT s.id,s.name,GREATEST(0,p.amount-p."paidAmount") FROM "Payment" p JOIN "Student" s ON s.id=p."studentId"
  WHERE p."periodStart">=${start} AND p."periodStart"<${end} AND p.status NOT IN ('VOID','REFUND')
  AND NOT EXISTS (SELECT 1 FROM "_GroupToStudent" gs JOIN "Group" g ON g.id=gs."A" WHERE gs."B"=s.id AND g.id=p."groupId" AND g."archivedAt" IS NULL AND s."archivedAt" IS NULL AND g."createdAt"<${end} AND s."createdAt"<${end})
 ) SELECT "studentId",name,SUM(balance)::bigint AS balance FROM charges GROUP BY "studentId",name HAVING SUM(balance)>0 ORDER BY balance DESC,name`;
  return {
    count: rows.length,
    total: rows.reduce((s, r) => s + Number(r.balance), 0),
    rows: rows.map((r) => ({ ...r, balance: Number(r.balance) })),
  };
}
