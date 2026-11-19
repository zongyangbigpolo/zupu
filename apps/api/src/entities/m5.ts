import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ClanLinkStatus, ImportDraftSource, ImportDraftStatus } from '@zupu/shared';

/** 跨家族连谱：proposer 族的 proposerPerson 与 target 族的 targetPerson 是同一人（如共同始祖、分支点） */
@Entity('clan_link')
export class ClanLinkEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) proposerClanId: string;
  @Column({ type: 'uuid' }) proposerPersonId: string;
  @Column({ type: 'uuid' }) targetClanId: string;
  /** 由对方管理员在同意时选定 */
  @Column({ type: 'uuid', nullable: true }) targetPersonId: string | null;
  @Column({ type: 'varchar', default: 'pending' }) status: ClanLinkStatus;
  @Column({ type: 'varchar', nullable: true }) note: string | null;
  @Column({ type: 'varchar', nullable: true }) decisionNote: string | null;
  @Column({ type: 'uuid', nullable: true }) proposedBy: string | null;
  @Column({ type: 'uuid', nullable: true }) decidedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) decidedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/** AI 纸质谱识别导入草稿（M5 仅预留表结构，暂不实现） */
@Entity('import_draft')
export class ImportDraftEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar', default: 'ocr' }) source: ImportDraftSource;
  @Column({ type: 'varchar', default: 'pending' }) status: ImportDraftStatus;
  @Column({ type: 'jsonb', nullable: true }) fileKeys: string[] | null;
  @Column({ type: 'jsonb', nullable: true }) payload: unknown;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const M5_ENTITIES = [ClanLinkEntity, ImportDraftEntity];
