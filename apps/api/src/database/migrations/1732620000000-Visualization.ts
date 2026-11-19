import { MigrationInterface, QueryRunner } from 'typeorm';

/** M3 可视化：迁徙记录、祠堂/祖坟/祖屋、家族大事记 */
export class Visualization1732620000000 implements MigrationInterface {
  name = 'Visualization1732620000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE migration_record (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid REFERENCES person(id) ON DELETE SET NULL,
        branch_name varchar(40),
        from_place varchar(100) NOT NULL,
        from_lng double precision,
        from_lat double precision,
        to_place varchar(100) NOT NULL,
        to_lng double precision,
        to_lat double precision,
        year int,
        migrate_date date,
        date_precision varchar(10),
        date_text varchar(60),
        reason text,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_migration_clan ON migration_record(clan_id, year);
      CREATE INDEX idx_migration_person ON migration_record(person_id);

      CREATE TABLE site (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        type varchar(20) NOT NULL,
        name varchar(100) NOT NULL,
        address varchar(200),
        lng double precision,
        lat double precision,
        intro text,
        built_text varchar(100),
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_site_clan ON site(clan_id);

      CREATE TABLE site_person (
        site_id uuid NOT NULL REFERENCES site(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        PRIMARY KEY (site_id, person_id)
      );
      CREATE INDEX idx_site_person_person ON site_person(person_id);

      CREATE TABLE site_photo (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        site_id uuid NOT NULL REFERENCES site(id) ON DELETE CASCADE,
        storage_key varchar(300) NOT NULL,
        mime_type varchar(60),
        size bigint,
        caption varchar(200),
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_site_photo_site ON site_photo(site_id);

      CREATE TABLE clan_chronicle (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid REFERENCES person(id) ON DELETE SET NULL,
        title varchar(100) NOT NULL,
        year int,
        event_date date,
        date_precision varchar(10),
        date_text varchar(60),
        place varchar(100),
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_chronicle_clan ON clan_chronicle(clan_id, year);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS clan_chronicle, site_photo, site_person, site, migration_record CASCADE;`);
  }
}
