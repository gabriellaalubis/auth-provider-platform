import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@app/contracts';
import { normalizeEmail } from '@app/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => normalizeEmail(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsNotEmpty()
  password!: string;
}
