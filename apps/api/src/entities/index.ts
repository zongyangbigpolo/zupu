import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ClanRole,
  ClanStatus,
  ClanVisibility,
  DatePrecision,
  Gender,
  MarriageType,
  MediaType,
  PrivacyLevel,
  RelationType,
} from '@zupu/shared';
import { HERITAGE_ENTITIES } from './heritage';

export * from './heritage';

// 注意：表结构以 src/database/migrations 为准，实体仅做映射（synchronize 关闭）。
// 后续里程碑（M2–M5）新增表请新增迁移文件 + 新实体，不要修改已发布的迁移。

@Entity('app_user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', nullable: true }) phone: string | null;
  @Column({ type: 'varchar', nullable: true }) email: string | null;
  @Column({ type: 'varchar', nullable: true }) displayName: string | null;
  @Column({ type: 'varchar', nullable: true, select: true }) passwordHash: string | null;
  /** 微信登录预留（M4） */
  @Column({ type: 'varchar', nullable: true }) wechatOpenid: string | null;
  @Column({ type: 'varchar', nullable: true }) wechatUnionid: string | null;
  @Column({ type: 'boolean', default: false }) isSuperAdmin: boolean;
  /** 预建账号激活码（哈希）与有效期 */
  @Column({ type: 'varchar', nullable: true }) activationCodeHash: string | null;
  @Column({ type: 'timestamptz', nullable: true }) activationExpiresAt: Date | null;
  @Column({ type: 'varchar', default: 'active' }) status: 'active' | 'disabled';
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('clan')
export class ClanEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar' }) surname: string;
  @Column({ type: 'varchar', nullable: true }) hallName: string | null;
  @Column({ type: 'varchar', nullable: true }) origin: string | null;
  @Column({ type: 'text', nullable: true }) generationPoem: string | null;
  @Column({ type: 'int', default: 1 }) poemStartGeneration: number;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'uuid', nullable: true }) founderId: string | null;
  @Column({ type: 'varchar', default: 'private' }) visibility: ClanVisibility;
  @Column({ type: 'varchar', default: 'active' }) status: ClanStatus;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('membership')
export class MembershipEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar' }) role: ClanRole;
  /** 我在谱中：绑定到谱中的人物 */
  @Column({ type: 'uuid', nullable: true }) linkedPersonId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('person')
export class PersonEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar' }) surname: string;
  @Column({ type: 'varchar' }) givenName: string;
  @Column({ type: 'varchar', insert: false, update: false }) fullName: string;
  @Column({ type: 'varchar', nullable: true }) courtesyName: string | null;
  @Column({ type: 'varchar', nullable: true }) artName: string | null;
  @Column({ type: 'varchar', nullable: true }) nickname: string | null;
  @Column({ type: 'varchar', default: 'unknown' }) gender: Gender;
  @Column({ type: 'int', nullable: true }) generation: number | null;
  @Column({ type: 'varchar', nullable: true }) generationChar: string | null;
  @Column({ type: 'int', nullable: true }) rankInSiblings: number | null;
  @Column({ type: 'date', nullable: true }) birthDate: string | null;
  @Column({ type: 'varchar', nullable: true }) birthPrecision: DatePrecision | null;
  @Column({ type: 'varchar', nullable: true }) birthText: string | null;
  @Column({ type: 'date', nullable: true }) deathDate: string | null;
  @Column({ type: 'varchar', nullable: true }) deathPrecision: DatePrecision | null;
  @Column({ type: 'varchar', nullable: true }) deathText: string | null;
  @Column({ type: 'boolean', default: false }) isLiving: boolean;
  @Column({ type: 'varchar', nullable: true }) ancestralHome: string | null;
  @Column({ type: 'varchar', nullable: true }) birthPlace: string | null;
  @Column({ type: 'varchar', nullable: true }) burialPlace: string | null;
  @Column({ type: 'text', nullable: true }) biography: string | null;
  /** AI 小传草稿（M5 预留） */
  @Column({ type: 'text', nullable: true }) biographyAiDraft: string | null;
  @Column({ type: 'varchar', nullable: true }) occupation: string | null;
  @Column({ type: 'boolean', default: false }) isExternal: boolean;
  @Column({ type: 'varchar', default: 'members' }) privacyLevel: PrivacyLevel;
  @Column({ type: 'uuid', nullable: true }) avatarMediaId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('parent_child')
export class ParentChildEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) parentId: string;
  @Column({ type: 'uuid' }) childId: string;
  @Column({ type: 'varchar', default: 'biological' }) relationType: RelationType;
  @Column({ type: 'boolean', default: true }) isMainLine: boolean;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
}

@Entity('marriage')
export class MarriageEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) husbandId: string;
  @Column({ type: 'uuid' }) wifeId: string;
  @Column({ type: 'varchar', default: 'principal' }) type: MarriageType;
  @Column({ type: 'int', default: 1, name: 'order' }) order: number;
  @Column({ type: 'varchar', nullable: true }) startText: string | null;
  @Column({ type: 'varchar', nullable: true }) endText: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
}

@Entity('media')
export class MediaEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'varchar' }) type: MediaType;
  @Column({ type: 'varchar' }) storageKey: string;
  @Column({ type: 'varchar', nullable: true }) mimeType: string | null;
  @Column({ type: 'bigint', nullable: true, transformer: { to: (v) => v, from: (v) => (v == null ? null : Number(v)) } })
  size: number | null;
  @Column({ type: 'varchar', nullable: true }) caption: string | null;
  @Column({ type: 'varchar', nullable: true }) thumbnailKey: string | null;
  @Column({ type: 'int', nullable: true }) duration: number | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('life_event')
export class LifeEventEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'varchar', nullable: true }) type: string | null;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'date', nullable: true }) eventDate: string | null;
  @Column({ type: 'varchar', nullable: true }) eventText: string | null;
  @Column({ type: 'varchar', nullable: true }) place: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) clanId: string | null;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'varchar' }) entity: string;
  @Column({ type: 'uuid', nullable: true }) entityId: string | null;
  @Column({ type: 'varchar' }) action: string;
  @Column({ type: 'jsonb', nullable: true }) before: unknown;
  @Column({ type: 'jsonb', nullable: true }) after: unknown;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

import { INTERACTION_ENTITIES } from './interaction';
export * from './interaction';

export const ENTITIES = [
  UserEntity,
  ClanEntity,
  MembershipEntity,
  PersonEntity,
  ParentChildEntity,
  MarriageEntity,
  MediaEntity,
  LifeEventEntity,
  AuditLogEntity,
  ...HERITAGE_ENTITIES,
  ...INTERACTION_ENTITIES,
];
