import { Global, Module } from '@nestjs/common';
import { AppAPrismaService } from './app-a-prisma.service';

@Global()
@Module({ providers: [AppAPrismaService], exports: [AppAPrismaService] })
export class AppADatabaseModule {}