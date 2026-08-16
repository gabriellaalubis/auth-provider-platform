import { Module } from '@nestjs/common';
import { PolicyEvaluatorService } from './policy-evaluator.service';

@Module({
  providers: [PolicyEvaluatorService],
  exports: [PolicyEvaluatorService],
})
export class AuthorizationModule {}
