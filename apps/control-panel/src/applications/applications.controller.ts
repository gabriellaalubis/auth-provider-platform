import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AddApplicationPolicyDto } from './dto/add-application-policy.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.applicationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.applicationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(id, dto);
  }

  @Post(':id/policies')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddApplicationPolicyDto,
  ): Promise<void> {
    await this.applicationsService.addPolicy(id, dto.groupId);
  }

  @Delete(':id/policies/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.applicationsService.removePolicy(id, groupId);
  }
}
