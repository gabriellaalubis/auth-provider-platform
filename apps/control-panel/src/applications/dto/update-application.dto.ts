import { NAME_MAX_LENGTH } from '@app/contracts';
import { normalizeName } from '@app/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const URL_OPTIONS = {
  require_tld: false,
  protocols: ['http', 'https'],
};

export class UpdateApplicationDto {
  @Transform(({ value }) => normalizeName(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(/\S/)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUrl(URL_OPTIONS, { each: true })
  redirectUris?: string[];

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  launchUrl?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  logoutNotificationUrl?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
