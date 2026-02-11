import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@eit.uz" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@eit.uz",
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log("Admin created");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
