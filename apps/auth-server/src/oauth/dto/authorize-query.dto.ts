import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

function normalizeChallengeMethod(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

export class AuthorizeQueryDto {
  @IsIn(['code'])
  response_type!: 'code';

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  client_id!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @Length(32, 128)
  state!: string;

  @IsString()
  @Length(43, 128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code_challenge!: string;

  @Transform(({ value }) => normalizeChallengeMethod(value))
  @IsIn(['S256'])
  code_challenge_method!: 'S256';
}
