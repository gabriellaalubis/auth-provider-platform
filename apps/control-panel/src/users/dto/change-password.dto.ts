import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@app/contracts';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/\S/)
  password!: string;
}
