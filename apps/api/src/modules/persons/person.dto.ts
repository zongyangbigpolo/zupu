import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const PRECISION = ['day', 'month', 'year', 'approx'];

export class PersonUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(10) surname?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30) givenName?: string;
  @IsOptional() @IsString() @MaxLength(30) courtesyName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) artName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) nickname?: string | null;
  @IsOptional() @IsIn(['male', 'female', 'unknown']) gender?: 'male' | 'female' | 'unknown';
  @IsOptional() @IsInt() @Min(1) generation?: number | null;
  @IsOptional() @IsString() @MaxLength(4) generationChar?: string | null;
  @IsOptional() @IsInt() @Min(1) rankInSiblings?: number | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsIn(PRECISION) birthPrecision?: string | null;
  @IsOptional() @IsString() @MaxLength(60) birthText?: string | null;
  @IsOptional() @IsDateString() deathDate?: string | null;
  @IsOptional() @IsIn(PRECISION) deathPrecision?: string | null;
  @IsOptional() @IsString() @MaxLength(60) deathText?: string | null;
  @IsOptional() @IsBoolean() isLiving?: boolean;
  @IsOptional() @IsString() @MaxLength(100) ancestralHome?: string | null;
  @IsOptional() @IsString() @MaxLength(100) birthPlace?: string | null;
  @IsOptional() @IsString() @MaxLength(200) burialPlace?: string | null;
  @IsOptional() @IsString() biography?: string | null;
  @IsOptional() @IsString() @MaxLength(100) occupation?: string | null;
  @IsOptional() @IsBoolean() isExternal?: boolean;
  @IsOptional() @IsIn(['public', 'members', 'admins']) privacyLevel?: 'public' | 'members' | 'admins';
  @IsOptional() @IsUUID() avatarMediaId?: string | null;
}

export class ParentLinkDto {
  @IsUUID() parentId: string;
  @IsOptional() @IsIn(['biological', 'adopted', 'heir', 'jiantiao']) relationType?: 'biological' | 'adopted' | 'heir' | 'jiantiao';
  @IsOptional() @IsBoolean() isMainLine?: boolean;
}

export class PersonCreateDto extends PersonUpdateDto {
  @IsString() @MinLength(1) @MaxLength(10) declare surname: string;
  @IsString() @MinLength(1) @MaxLength(30) declare givenName: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ParentLinkDto) parents?: ParentLinkDto[];
}

export class PersonSearchQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() generation?: number;
  @IsOptional() @IsString() generationChar?: string;
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
  @IsOptional() @IsString() includeExternal?: string;
}

export class TreeQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) up?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) down?: number;
  @IsOptional() @IsIn(['main', 'birth']) line?: 'main' | 'birth';
}
