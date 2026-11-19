import { MigrationInterface, QueryRunner } from 'typeorm';

/** M1 初始结构。后续里程碑请新增迁移文件，不要改动本文件。 */
export class Init1731990000000 implements MigrationInterface {
  name = 'Init1731990000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE app_user (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone varchar(20) UNIQUE,
        email varchar(120) UNIQUE,
        display_name varchar(60),
        password_hash varchar(100),
        wechat_openid varchar(64) UNIQUE,
        wechat_unionid varchar(64),
        is_super_admin boolean NOT NULL DEFAULT false,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE clan (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        surname varchar(10) NOT NULL,
        hall_name varchar(60),
        origin varchar(60),
        generation_poem text,
        poem_start_generation int NOT NULL DEFAULT 1,
        description text,
        founder_id uuid,
        visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private','invite')),
        status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE person (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        surname varchar(10) NOT NULL,
        given_name varchar(30) NOT NULL,
        full_name varchar(40) GENERATED ALWAYS AS (surname || given_name) STORED,
        courtesy_name varchar(30),
        art_name varchar(30),
        nickname varchar(30),
        gender varchar(8) NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','unknown')),
        generation int,
        generation_char varchar(4),
        rank_in_siblings int,
        birth_date date,
        birth_precision varchar(8) CHECK (birth_precision IN ('day','month','year','approx')),
        birth_text varchar(60),
        death_date date,
        death_precision varchar(8) CHECK (death_precision IN ('day','month','year','approx')),
        death_text varchar(60),
        is_living boolean NOT NULL DEFAULT false,
        ancestral_home varchar(100),
        birth_place varchar(100),
        burial_place varchar(200),
        biography text,
        biography_ai_draft text,
        occupation varchar(100),
        is_external boolean NOT NULL DEFAULT false,
        privacy_level varchar(16) NOT NULL DEFAULT 'members' CHECK (privacy_level IN ('public','members','admins')),
        avatar_media_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_person_clan_name ON person(clan_id, full_name);
      CREATE INDEX idx_person_clan_generation ON person(clan_id, generation);

      ALTER TABLE clan ADD CONSTRAINT fk_clan_founder FOREIGN KEY (founder_id) REFERENCES person(id) ON DELETE SET NULL;

      CREATE TABLE membership (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        role varchar(16) NOT NULL CHECK (role IN ('admin','member')),
        linked_person_id uuid REFERENCES person(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, clan_id)
      );
      CREATE INDEX idx_membership_clan ON membership(clan_id);

      CREATE TABLE parent_child (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        parent_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        child_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        relation_type varchar(16) NOT NULL DEFAULT 'biological' CHECK (relation_type IN ('biological','adopted','heir','jiantiao')),
        is_main_line boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        UNIQUE (parent_id, child_id),
        CHECK (parent_id <> child_id)
      );
      CREATE INDEX idx_pc_child ON parent_child(child_id);
      CREATE INDEX idx_pc_parent ON parent_child(parent_id);
      CREATE INDEX idx_pc_clan ON parent_child(clan_id);

      CREATE TABLE marriage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        husband_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        wife_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        type varchar(16) NOT NULL DEFAULT 'principal' CHECK (type IN ('principal','successor','concubine','other')),
        "order" int NOT NULL DEFAULT 1,
        start_text varchar(60),
        end_text varchar(60),
        note text,
        UNIQUE (husband_id, wife_id),
        CHECK (husband_id <> wife_id)
      );
      CREATE INDEX idx_marriage_husband ON marriage(husband_id);
      CREATE INDEX idx_marriage_wife ON marriage(wife_id);
      CREATE INDEX idx_marriage_clan ON marriage(clan_id);

      CREATE TABLE media (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        type varchar(8) NOT NULL CHECK (type IN ('photo','video','audio','doc')),
        storage_key varchar(300) NOT NULL,
        mime_type varchar(100),
        size bigint,
        caption varchar(200),
        thumbnail_key varchar(300),
        duration int,
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_media_person ON media(person_id);

      CREATE TABLE life_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        type varchar(30),
        title varchar(100) NOT NULL,
        event_date date,
        event_text varchar(60),
        place varchar(100),
        description text,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_event_person ON life_event(person_id);

      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid,
        user_id uuid,
        entity varchar(40) NOT NULL,
        entity_id uuid,
        action varchar(40) NOT NULL,
        before jsonb,
        after jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_audit_clan_time ON audit_log(clan_id, created_at DESC);
      CREATE INDEX idx_audit_time ON audit_log(created_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS audit_log, life_event, media, marriage, parent_child, membership CASCADE;
      ALTER TABLE clan DROP CONSTRAINT IF EXISTS fk_clan_founder;
      DROP TABLE IF EXISTS person, clan, app_user CASCADE;
    `);
  }
}
