import { Test, TestingModule } from '@nestjs/testing';
import { SyncWorkerController } from './sync-worker.controller';
import { SyncWorkerService } from './sync-worker.service';

describe('SyncWorkerController', () => {
  let syncWorkerController: SyncWorkerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SyncWorkerController],
      providers: [SyncWorkerService],
    }).compile();

    syncWorkerController = app.get<SyncWorkerController>(SyncWorkerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(syncWorkerController.getHello()).toBe('Hello World!');
    });
  });
});
