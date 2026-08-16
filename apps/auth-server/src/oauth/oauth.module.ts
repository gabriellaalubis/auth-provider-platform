import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthorizationCodeService } from './authorization-code.service';
import { OAuthController } from './oauth.controller';
import { TokenExchangeService } from './token-exchange.service';
import { UserInfoService } from './userinfo.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [OAuthController],
  providers: [AuthorizationCodeService, TokenExchangeService, UserInfoService],
})
export class OAuthModule {}
