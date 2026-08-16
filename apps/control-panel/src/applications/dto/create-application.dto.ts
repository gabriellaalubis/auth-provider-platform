import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '@app/contracts';
import { normalizeName } from '@app/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const URL_OPTIONS = {
  require_tld: false,
  protocols: ['http', 'https'],
};

export class CreateApplicationDto {
  @Transform(({ value }) => normalizeName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(/\S/)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(191)
  @Matches(/^[A-Za-z0-9._-]+$/)
  clientId!: string;

  @IsString()
  @MinLength(24)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/\S/)
  clientSecret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUrl(URL_OPTIONS, { each: true })
  redirectUris!: string[];

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  launchUrl?: string;

  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  logoutNotificationUrl!: string;
}
