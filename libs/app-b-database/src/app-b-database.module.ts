import { Global, Module } from '@nestjs/common';
import { AppBPrismaService } from './app-b-prisma.service';

@Global()
@Module({ providers: [AppBPrismaService], exports: [AppBPrismaService] })
export class AppBDatabaseModule {}
