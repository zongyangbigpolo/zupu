import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { DatePrecision, SiteType } from '@zupu/shared';

// M3 可视化实体（表结构见 migrations/1732620000000-Visualization.ts）

const num = { to: (v: unknown) => v, from: (v: unknown) => (v == null ? null : Number(v)) };

@Entity('migration_record')
export class MigrationRecordEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid', nullable: true }) personId: string | null;
  @Column({ type: 'varchar', nullable: true }) branchName: string | null;
  @Column({ type: 'varchar' }) fromPlace: string;
  @Column({ type: 'double precision', nullable: true }) fromLng: number | null;
  @Column({ type: 'double precision', nullable: true }) fromLat: number | null;
  @Column({ type: 'varchar' }) toPlace: string;
  @Column({ type: 'double precision', nullable: true }) toLng: number | null;
  @Column({ type: 'double precision', nullable: true }) toLat: number | null;
  @Column({ type: 'int', nullable: true }) year: number | null;
  @Column({ type: 'date', nullable: true }) migrateDate: string | null;
  @Column({ type: 'varchar', nullable: true }) datePrecision: DatePrecision | null;
  @Column({ type: 'varchar', nullable: true }) dateText: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('site')
export class SiteEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar' }) type: SiteType;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar', nullable: true }) address: string | null;
  @Column({ type: 'double precision', nullable: true }) lng: number | null;
  @Column({ type: 'double precision', nullable: true }) lat: number | null;
  @Column({ type: 'text', nullable: true }) intro: string | null;
  @Column({ type: 'varchar', nullable: true }) builtText: string | null;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('site_person')
export class SitePersonEntity {
  @PrimaryColumn('uuid') siteId: string;
  @PrimaryColumn('uuid') personId: string;
  @Column({ type: 'uuid' }) clanId: string;
}

@Entity('site_photo')
export class SitePhotoEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) siteId: string;
  @Column({ type: 'varchar' }) storageKey: string;
  @Column({ type: 'varchar', nullable: true }) mimeType: string | null;
  @Column({ type: 'bigint', nullable: true, transformer: num }) size: number | null;
  @Column({ type: 'varchar', nullable: true }) caption: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('clan_chronicle')
export class ChronicleEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid', nullable: true }) personId: string | null;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'int', nullable: true }) year: number | null;
  @Column({ type: 'date', nullable: true }) eventDate: string | null;
  @Column({ type: 'varchar', nullable: true }) datePrecision: DatePrecision | null;
  @Column({ type: 'varchar', nullable: true }) dateText: string | null;
  @Column({ type: 'varchar', nullable: true }) place: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const VISUAL_ENTITIES = [MigrationRecordEntity, SiteEntity, SitePersonEntity, SitePhotoEntity, ChronicleEntity];
