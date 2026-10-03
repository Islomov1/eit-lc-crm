import { prisma } from "./prisma";
export async function audit(
  actor: { id: string; name: string },
  action: string,
  entity: string,
  entityId: string,
  summary: string,
) {
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action,
      entity,
      entityId,
      summary,
    },
  });
}
