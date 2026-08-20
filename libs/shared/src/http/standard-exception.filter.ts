import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorResponse } from '@app/contracts';
import { randomUUID } from 'node:crypto';
import { RequestWithId } from './request-id.middleware';

@Catch()
export class StandardExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again later.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
        message = 'Some submitted data is invalid.';
      } else if (status === HttpStatus.UNAUTHORIZED) {
        code = 'UNAUTHORIZED';
        message = 'Authentication is required or invalid.';
      } else if (status === HttpStatus.FORBIDDEN) {
        code = 'ACCESS_DENIED';
        message = 'You do not have permission to perform this action.';
      } else if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'The requested resource was not found.';
      } else if (status === HttpStatus.CONFLICT) {
        code = 'CONFLICT';
        message = 'The request conflicts with existing data.';
      }
    }

    const errorResponse: ErrorResponse = {
      error: {
        code,
        message,
        requestId,
      },
    };

    response.status(status).json(errorResponse);
  }
}
