import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
