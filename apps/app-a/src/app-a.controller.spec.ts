import { Test, TestingModule } from '@nestjs/testing';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';

describe('AppAController', () => {
  let appAController: AppAController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppAController],
      providers: [AppAService],
    }).compile();

    appAController = app.get<AppAController>(AppAController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appAController.getHello()).toBe('Hello World!');
    });
  });
});
