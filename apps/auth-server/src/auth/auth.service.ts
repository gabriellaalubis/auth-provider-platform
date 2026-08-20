import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthPrismaService, UserStatus } from '@app/auth-database';
import type { UserResponse } from '@app/contracts';
import { PasswordService } from '@app/security';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  status: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {
    this.dummyHash = this.passwordService.hash(
      'dummy-password-that-is-never-a-valid-login',
    );
  }

  async login(dto: LoginDto) {
    const user = await this.authPrisma.user.findUnique({
      where: { email: dto.email },
      select: USER_SELECT,
    });
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordValid = await this.passwordService.verify(hash, dto.password);

    if (!user || !passwordValid || user.status !== UserStatus.ACTIVE) {
      await this.authPrisma.auditLog.create({
        data: {
          eventType: 'LOGIN_FAILED',
          userId: user?.id,
          result: 'failed',
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const safeUser: UserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    return this.sessionService.create(safeUser);
  }
}
