import { NAME_MAX_LENGTH } from '@app/contracts';
import { normalizeName } from '@app/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @Transform(({ value }) => normalizeName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(/\S/)
  name!: string;
}
