import { Test, TestingModule } from '@nestjs/testing';
import { ControlPanelController } from './control-panel.controller';

describe('ControlPanelController', () => {
  let controlPanelController: ControlPanelController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ControlPanelController],
    }).compile();

    controlPanelController = app.get<ControlPanelController>(
      ControlPanelController,
    );
  });

  describe('root', () => {
    it('renders the administrative Control Panel', () => {
      const html = controlPanelController.getControlPanel();

      expect(html).toContain('<title>SSO Control Panel</title>');
      expect(html).toContain('Identity and access administration');
      expect(html).toContain('Users');
      expect(html).toContain('Groups');
      expect(html).toContain('Applications');
      expect(html).toContain("request('/users')");
      expect(html).toContain("request('/groups')");
      expect(html).toContain("request('/applications')");
    });
  });
});
