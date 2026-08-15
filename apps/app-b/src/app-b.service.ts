import { Injectable } from '@nestjs/common';

@Injectable()
export class AppBService {
  getHello(): string {
    return 'Hello World!';
  }
}
