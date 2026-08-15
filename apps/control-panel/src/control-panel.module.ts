import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { ControlPanelController } from './control-panel.controller';
import { ControlPanelService } from './control-panel.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [ControlPanelController],
  providers: [ControlPanelService],
})
export class ControlPanelModule {}
