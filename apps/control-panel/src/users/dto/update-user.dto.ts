import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH } from '@app/contracts';
import { normalizeEmail, normalizeName } from '@app/shared';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @Transform(({ value }) => normalizeName(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(/\S/)
  name?: string;

  @IsEmail()
  @Transform(({ value }) => normalizeEmail(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;
}
