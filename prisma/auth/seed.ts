import { PrismaClient, UserStatus } from '../../generated/prisma/auth';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@app/contracts';
import { PasswordService } from '@app/security';
import { normalizeEmail, normalizeName } from '@app/shared';

const prisma = new PrismaClient();
const passwordService = new PasswordService();

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} wajib diisi untuk menjalankan seed`);
  }
  return value;
}

async function seed(): Promise<void> {
  const normalizedName = normalizeName(requiredEnvironment('SEED_ADMIN_NAME'));
  const normalizedEmail = normalizeEmail(
    requiredEnvironment('SEED_ADMIN_EMAIL'),
  );
  const password = requiredEnvironment('SEED_ADMIN_PASSWORD');

  if (typeof normalizedName !== 'string' || normalizedName.length === 0) {
    throw new Error('SEED_ADMIN_NAME tidak valid');
  }
  if (typeof normalizedEmail !== 'string' || normalizedEmail.length === 0) {
    throw new Error('SEED_ADMIN_EMAIL tidak valid');
  }
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    !/\S/.test(password)
  ) {
    throw new Error('SEED_ADMIN_PASSWORD tidak memenuhi kebijakan password');
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: normalizedName, status: UserStatus.ACTIVE },
    });
    console.log(`Seed user tersedia: ${normalizedEmail}`);
    return;
  }

  const passwordHash = await passwordService.hash(password);
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    await transaction.auditLog.create({
      data: {
        eventType: 'USER_SEEDED',
        userId: user.id,
        result: 'success',
      },
    });
  });

  console.log(`Seed user dibuat: ${normalizedEmail}`);
}

seed()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Auth seed gagal: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
