import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ClanDocumentKind, ImportRowPreview, ImportSummary, TributeKind } from '@zupu/shared';

// M2 内容与传承（表结构见 migrations/1732600000000-M2Heritage.ts）。
// media 表新增的列（width/height/category/...）由 gallery 模块以原生 SQL 读写，不改动 M1 的 MediaEntity。

const bigintNum = { to: (v: unknown) => v, from: (v: unknown) => (v == null ? null : Number(v)) };

@Entity('oral_history')
export class OralHistoryEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'uuid', nullable: true }) mediaId: string | null;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'varchar', nullable: true }) narrator: string | null;
  @Column({ type: 'varchar', nullable: true }) recordedText: string | null;
  @Column({ type: 'text', nullable: true }) transcript: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('memorial_message')
export class MemorialMessageEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'varchar' }) content: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('memorial_tribute')
export class MemorialTributeEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar' }) kind: TributeKind;
  @Column({ type: 'date', insert: false }) tributeDay: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('clan_document')
export class ClanDocumentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar' }) kind: ClanDocumentKind;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'text', nullable: true }) content: string | null;
  @Column({ type: 'boolean', default: false }) vertical: boolean;
  @Column({ type: 'int', default: 0 }) sortOrder: number;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('import_batch')
export class ImportBatchEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar', nullable: true }) fileName: string | null;
  @Column({ type: 'varchar', default: 'preview' }) status: 'preview' | 'committed' | 'discarded';
  @Column({ type: 'jsonb' }) rows: ImportRowPreview[];
  @Column({ type: 'jsonb' }) summary: ImportSummary;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) committedAt: Date | null;
}

@Entity('backup_job')
export class BackupJobEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) trigger: 'scheduled' | 'manual';
  @Column({ type: 'varchar' }) status: 'running' | 'success' | 'failed';
  @Column({ type: 'varchar', nullable: true }) method: string | null;
  @Column({ type: 'varchar', nullable: true }) storageKey: string | null;
  @Column({ type: 'bigint', nullable: true, transformer: bigintNum }) size: number | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
}

export const HERITAGE_ENTITIES = [
  OralHistoryEntity,
  MemorialMessageEntity,
  MemorialTributeEntity,
  ClanDocumentEntity,
  ImportBatchEntity,
  BackupJobEntity,
];
