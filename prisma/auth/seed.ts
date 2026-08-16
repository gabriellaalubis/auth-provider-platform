import {
  ApplicationStatus,
  PrismaClient,
  UserStatus,
} from '../../generated/prisma/auth';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@app/contracts';
import { PasswordService } from '@app/security';
import { normalizeEmail, normalizeName } from '@app/shared';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();
const passwordService = new PasswordService();

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} wajib diisi untuk menjalankan seed`);
  }
  return value;
}

function validateClientSecret(name: string, value: string): void {
  if (value.length < 24 || value.length > 128 || !/\S/.test(value)) {
    throw new Error(`${name} harus memiliki panjang 24-128 karakter`);
  }
}

function hashRedirectUri(redirectUri: string): string {
  return createHash('sha256').update(redirectUri).digest('hex');
}

async function seedAdmin(): Promise<string> {
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
    return existing.id;
  }

  const passwordHash = await passwordService.hash(password);
  return prisma.$transaction(async (transaction) => {
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
    return user.id;
  });
}

async function seedApplication(input: {
  name: string;
  clientId: string;
  clientSecret: string;
  launchUrl: string;
  redirectUri: string;
  logoutNotificationUrl: string;
}): Promise<string> {
  const existing = await prisma.application.findUnique({
    where: { clientId: input.clientId },
  });

  let applicationId: string;
  if (existing) {
    const application = await prisma.application.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        launchUrl: input.launchUrl,
        logoutNotificationUrl: input.logoutNotificationUrl,
        status: ApplicationStatus.ACTIVE,
      },
    });
    applicationId = application.id;
  } else {
    const clientSecretHash = await passwordService.hash(input.clientSecret);
    const application = await prisma.application.create({
      data: {
        name: input.name,
        clientId: input.clientId,
        clientSecretHash,
        launchUrl: input.launchUrl,
        logoutNotificationUrl: input.logoutNotificationUrl,
        status: ApplicationStatus.ACTIVE,
      },
    });
    applicationId = application.id;
  }

  const redirectUriHash = hashRedirectUri(input.redirectUri);
  await prisma.applicationRedirectUri.upsert({
    where: {
      applicationId_redirectUriHash: { applicationId, redirectUriHash },
    },
    create: { applicationId, redirectUri: input.redirectUri, redirectUriHash },
    update: { redirectUri: input.redirectUri },
  });

  return applicationId;
}

async function seed(): Promise<void> {
  const appASecret = requiredEnvironment('SEED_APP_A_CLIENT_SECRET');
  const appBSecret = requiredEnvironment('SEED_APP_B_CLIENT_SECRET');
  validateClientSecret('SEED_APP_A_CLIENT_SECRET', appASecret);
  validateClientSecret('SEED_APP_B_CLIENT_SECRET', appBSecret);

  const adminId = await seedAdmin();
  const appAGroup = await prisma.group.upsert({
    where: { name: 'app-a-users' },
    create: { name: 'app-a-users' },
    update: {},
  });
  const appBGroup = await prisma.group.upsert({
    where: { name: 'app-b-users' },
    create: { name: 'app-b-users' },
    update: {},
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: adminId, groupId: appAGroup.id } },
    create: { userId: adminId, groupId: appAGroup.id },
    update: {},
  });
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: adminId, groupId: appBGroup.id } },
    create: { userId: adminId, groupId: appBGroup.id },
    update: {},
  });

  const appAId = await seedApplication({
    name: 'App A',
    clientId: 'app-a',
    clientSecret: appASecret,
    launchUrl: 'http://localhost:4001',
    redirectUri: 'http://localhost:4001/callback',
    logoutNotificationUrl: 'http://app-a:4001/internal/logout',
  });
  const appBId = await seedApplication({
    name: 'App B',
    clientId: 'app-b',
    clientSecret: appBSecret,
    launchUrl: 'http://localhost:4002',
    redirectUri: 'http://localhost:4002/callback',
    logoutNotificationUrl: 'http://app-b:4002/internal/logout',
  });

  await prisma.applicationGroup.upsert({
    where: {
      applicationId_groupId: {
        applicationId: appAId,
        groupId: appAGroup.id,
      },
    },
    create: { applicationId: appAId, groupId: appAGroup.id },
    update: {},
  });
  await prisma.applicationGroup.upsert({
    where: {
      applicationId_groupId: {
        applicationId: appBId,
        groupId: appBGroup.id,
      },
    },
    create: { applicationId: appBId, groupId: appBGroup.id },
    update: {},
  });

  console.log('Seed Auth Provider tersedia untuk client app-a dan app-b');
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
