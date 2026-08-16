import { IsUUID } from 'class-validator';

export class AddGroupMemberDto {
  @IsUUID()
  userId!: string;
}
