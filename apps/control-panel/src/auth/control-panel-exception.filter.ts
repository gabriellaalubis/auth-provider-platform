import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StandardExceptionFilter } from '@app/shared';
import type { Request, Response } from 'express';
import { renderControlPanelAccessPage } from '../control-panel-access.ui';

@Catch()
export class ControlPanelExceptionFilter implements ExceptionFilter {
  private readonly standardFilter = new StandardExceptionFilter();

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const isSignedOut = exception instanceof UnauthorizedException;
    const isDenied = exception instanceof ForbiddenException;

    if (
      request.method === 'GET' &&
      request.path === '/' &&
      (isSignedOut || isDenied)
    ) {
      const authUrl = this.config.getOrThrow<string>('AUTH_SERVER_PUBLIC_URL');
      response
        .status(exception.getStatus())
        .type('html')
        .send(
          renderControlPanelAccessPage(
            isDenied ? 'denied' : 'signed-out',
            authUrl,
          ),
        );
      return;
    }

    this.standardFilter.catch(exception, host);
  }
}
