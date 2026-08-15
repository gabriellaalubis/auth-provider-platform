import { Global, Module } from '@nestjs/common';
import { AuthPrismaService } from './auth-prisma.service';

@Global()
@Module({
  providers: [AuthPrismaService],
  exports: [AuthPrismaService],
})
export class AuthDatabaseModule {}
