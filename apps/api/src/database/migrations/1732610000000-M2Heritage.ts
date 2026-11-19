import { MigrationInterface, QueryRunner } from 'typeorm';

/** M2 内容与传承：多媒体元数据、口述历史、人物纪念馆、家族文献、Excel 导入批次、备份任务 */
export class M2Heritage1732610000000 implements MigrationInterface {
  name = 'M2Heritage1732610000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE media ADD COLUMN width int;
      ALTER TABLE media ADD COLUMN height int;
      ALTER TABLE media ADD COLUMN category varchar(20) NOT NULL DEFAULT 'gallery';
      ALTER TABLE media ADD COLUMN taken_text varchar(60);
      ALTER TABLE media ADD COLUMN description text;
      ALTER TABLE media ADD COLUMN sort_order int NOT NULL DEFAULT 0;
      ALTER TABLE media ADD COLUMN transcode_status varchar(16) NOT NULL DEFAULT 'none';
      CREATE INDEX idx_media_clan_type ON media(clan_id, type, category);

      CREATE TABLE oral_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        media_id uuid REFERENCES media(id) ON DELETE SET NULL,
        title varchar(100) NOT NULL,
        narrator varchar(60),
        recorded_text varchar(60),
        transcript text,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_oral_person ON oral_history(person_id);
      CREATE INDEX idx_oral_clan ON oral_history(clan_id, created_at DESC);

      CREATE TABLE memorial_message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
        content varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_memorial_msg_person ON memorial_message(person_id, created_at DESC);

      CREATE TABLE memorial_tribute (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        kind varchar(10) NOT NULL CHECK (kind IN ('flower','candle')),
        tribute_day date NOT NULL DEFAULT CURRENT_DATE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (person_id, user_id, kind, tribute_day)
      );
      CREATE INDEX idx_memorial_tribute_person ON memorial_tribute(person_id, kind);

      CREATE TABLE clan_document (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        kind varchar(20) NOT NULL CHECK (kind IN ('family_rules','clan_rules','preface','conventions','other')),
        title varchar(100) NOT NULL,
        content text,
        vertical boolean NOT NULL DEFAULT false,
        sort_order int NOT NULL DEFAULT 0,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_clan_document_clan ON clan_document(clan_id, sort_order);

      CREATE TABLE import_batch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        file_name varchar(200),
        status varchar(16) NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','discarded')),
        rows jsonb NOT NULL,
        summary jsonb NOT NULL,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz
      );
      CREATE INDEX idx_import_batch_clan ON import_batch(clan_id, created_at DESC);

      CREATE TABLE backup_job (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger varchar(16) NOT NULL CHECK (trigger IN ('scheduled','manual')),
        status varchar(16) NOT NULL CHECK (status IN ('running','success','failed')),
        method varchar(16),
        storage_key varchar(300),
        size bigint,
        error text,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      );
      CREATE INDEX idx_backup_job_time ON backup_job(started_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS backup_job, import_batch, clan_document, memorial_tribute, memorial_message, oral_history CASCADE;
      DROP INDEX IF EXISTS idx_media_clan_type;
      ALTER TABLE media DROP COLUMN width, DROP COLUMN height, DROP COLUMN category, DROP COLUMN taken_text,
        DROP COLUMN description, DROP COLUMN sort_order, DROP COLUMN transcode_status;
    `);
  }
}
