import { Injectable } from '@nestjs/common';

@Injectable()
export class ControlPanelService {
  getHello(): string {
    return 'Hello World!';
  }
}
