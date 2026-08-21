import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class MfaLoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  mfaToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
