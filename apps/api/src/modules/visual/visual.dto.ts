import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { DatePrecision, PedigreeStyle, SiteType } from '@zupu/shared';

const PRECISION = ['day', 'month', 'year', 'approx'];
export const SITE_TYPES: SiteType[] = ['ancestral_hall', 'tomb', 'ancestral_house', 'other'];

class FuzzyDateDto {
  @IsOptional() @IsInt() @Min(-3000) @Max(2200) year?: number | null;
  @IsOptional() @IsDateString() date?: string | null;
  @IsOptional() @IsIn(PRECISION) datePrecision?: DatePrecision | null;
  @IsOptional() @IsString() @MaxLength(60) dateText?: string | null;
}

export class MigrationDto extends FuzzyDateDto {
  @IsOptional() @IsUUID() personId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) branchName?: string | null;
  @IsString() @MinLength(1) @MaxLength(100) fromPlace: string;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) fromLng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) fromLat?: number | null;
  @IsString() @MinLength(1) @MaxLength(100) toPlace: string;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) toLng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) toLat?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class MigrationUpdateDto extends FuzzyDateDto {
  @IsOptional() @IsUUID() personId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) branchName?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) fromPlace?: string;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) fromLng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) fromLat?: number | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) toPlace?: string;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) toLng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) toLat?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class SiteDto {
  @IsIn(SITE_TYPES) type: SiteType;
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional() @IsString() @MaxLength(20000) intro?: string | null;
  @IsOptional() @IsString() @MaxLength(100) builtText?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) personIds?: string[];
}

export class SiteUpdateDto {
  @IsOptional() @IsIn(SITE_TYPES) type?: SiteType;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional() @IsString() @MaxLength(20000) intro?: string | null;
  @IsOptional() @IsString() @MaxLength(100) builtText?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) personIds?: string[];
}

export class ChronicleDto extends FuzzyDateDto {
  @IsString() @MinLength(1) @MaxLength(100) title: string;
  @IsOptional() @IsString() @MaxLength(100) place?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsUUID() personId?: string | null;
}

export class ChronicleUpdateDto extends FuzzyDateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(100) place?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsUUID() personId?: string | null;
}

const toBool = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1');

export class BranchQuery {
  @IsOptional() @IsUUID() branchRootId?: string;
  @IsOptional() @IsUUID() personId?: string;
}

export class TimelineQuery extends BranchQuery {
  @IsOptional() @Transform(toBool) @IsBoolean() lifeSpans?: boolean;
}

export class SiteListQuery {
  @IsOptional() @IsIn(SITE_TYPES) type?: SiteType;
}

export class PedigreeQueryDto {
  @IsUUID() rootId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) generations?: number;
  @IsOptional() @IsIn(['ou', 'su']) style?: PedigreeStyle;
  @IsOptional() @Transform(toBool) @IsBoolean() daughters?: boolean;
  @IsOptional() @IsIn(['A4', 'A3']) paper?: 'A4' | 'A3';
  @IsOptional() @Transform(toBool) @IsBoolean() cover?: boolean;
}

/** 年份：显式给出的优先，否则取精确日期的年份 */
export function resolveYear(year: number | null | undefined, date: string | null | undefined): number | null {
  if (year != null) return year;
  if (date) {
    const y = Number(date.slice(0, 4));
    if (Number.isFinite(y)) return y;
  }
  return null;
}

export function assertCoordPair(lng: number | null | undefined, lat: number | null | undefined, label: string) {
  if ((lng == null) !== (lat == null)) throw new BadRequestException(`${label}的经度、纬度需同时填写`);
}

export const pick = <T extends object>(o: T, keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined));
