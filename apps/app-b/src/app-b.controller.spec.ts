import { Test, TestingModule } from '@nestjs/testing';
import { AppBController } from './app-b.controller';
import { AppBService } from './app-b.service';

describe('AppBController', () => {
  let appBController: AppBController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppBController],
      providers: [AppBService],
    }).compile();

    appBController = app.get<AppBController>(AppBController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appBController.getHello()).toBe('Hello World!');
    });
  });
});
