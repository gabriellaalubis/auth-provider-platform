import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { TotpService } from './totp.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, MfaService, TotpService],
  exports: [SessionService, MfaService],
})
export class AuthModule {}
