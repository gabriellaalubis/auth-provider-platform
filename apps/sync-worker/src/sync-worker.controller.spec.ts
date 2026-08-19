import { Test, TestingModule } from '@nestjs/testing';
import { SyncWorkerController } from './sync-worker.controller';
import { SyncWorkerService } from './sync-worker.service';

describe('SyncWorkerController', () => {
  let syncWorkerController: SyncWorkerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SyncWorkerController],
      providers: [
        {
          provide: SyncWorkerService,
          useValue: {
            getHello: jest.fn().mockReturnValue('Sync Worker is running'),
          },
        },
      ],
    }).compile();

    syncWorkerController = app.get<SyncWorkerController>(SyncWorkerController);
  });

  describe('root', () => {
    it('should return the worker status', () => {
      expect(syncWorkerController.getHello()).toBe('Sync Worker is running');
    });
  });
});
