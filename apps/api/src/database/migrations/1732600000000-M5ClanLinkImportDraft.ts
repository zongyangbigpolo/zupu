import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M5 扩展：
 * - clan_link：跨家族连谱（同源不同支系的两个家族，把 A 族某人与 B 族的同一人对应起来；一方提议、另一方管理员或超级管理员同意）
 * - import_draft：AI 纸质谱识别导入草稿（仅预留，暂不实现）
 */
export class M5ClanLinkImportDraft1732600000000 implements MigrationInterface {
  name = 'M5ClanLinkImportDraft1732600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE clan_link (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        proposer_clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        proposer_person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        target_clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        target_person_id uuid REFERENCES person(id) ON DELETE CASCADE,
        status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
        note varchar(500),
        decision_note varchar(500),
        proposed_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        decided_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (proposer_clan_id <> target_clan_id)
      );
      CREATE UNIQUE INDEX uq_clan_link_active ON clan_link (LEAST(proposer_clan_id, target_clan_id), GREATEST(proposer_clan_id, target_clan_id))
        WHERE status IN ('pending','approved');
      CREATE INDEX idx_clan_link_proposer ON clan_link(proposer_clan_id);
      CREATE INDEX idx_clan_link_target ON clan_link(target_clan_id);

      CREATE TABLE import_draft (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        source varchar(16) NOT NULL DEFAULT 'ocr' CHECK (source IN ('ocr','excel','gedcom')),
        status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','imported','failed')),
        file_keys jsonb,
        payload jsonb,
        error text,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_import_draft_clan ON import_draft(clan_id, created_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS import_draft, clan_link;`);
  }
}
