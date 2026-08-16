import { IsUUID } from 'class-validator';

export class AddApplicationPolicyDto {
  @IsUUID()
  groupId!: string;
}
