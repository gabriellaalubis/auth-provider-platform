import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthorizationCodeService } from './authorization-code.service';
import { OAuthController } from './oauth.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [OAuthController],
  providers: [AuthorizationCodeService],
})
export class OAuthModule {}
