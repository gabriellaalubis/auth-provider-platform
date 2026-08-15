import { Injectable } from '@nestjs/common';

@Injectable()
export class SyncWorkerService {
  getHello(): string {
    return 'Hello World!';
  }
}
