import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class TokenRequestDto {
  @IsIn(['authorization_code'])
  grant_type!: 'authorization_code';

  @IsString()
  @Length(32, 128)
  code!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  client_secret!: string;

  @IsString()
  @Length(43, 128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  code_verifier!: string;
}
