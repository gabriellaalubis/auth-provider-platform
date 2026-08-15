import { Test, TestingModule } from '@nestjs/testing';
import { ControlPanelController } from './control-panel.controller';
import { ControlPanelService } from './control-panel.service';

describe('ControlPanelController', () => {
  let controlPanelController: ControlPanelController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ControlPanelController],
      providers: [ControlPanelService],
    }).compile();

    controlPanelController = app.get<ControlPanelController>(
      ControlPanelController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(controlPanelController.getHello()).toBe('Hello World!');
    });
  });
});
