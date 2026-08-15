import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponse } from '@app/contracts';
import { RequestWithId } from './request-id.middleware';

@Catch()
export class StandardExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Terdapat kesalahan internal';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
        message = 'Data yang dikirim tidak valid';
      } else if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'Resource tidak ditemukan';
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
