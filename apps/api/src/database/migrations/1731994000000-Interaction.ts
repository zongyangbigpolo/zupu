import { MigrationInterface, QueryRunner } from 'typeorm';

/** M4 小程序与互动：族人通讯录、活动与公告、生日/忌日提醒、站内通知、微信订阅消息额度 */
export class Interaction1731994000000 implements MigrationInterface {
  name = 'Interaction1731994000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE contact_card (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        fields jsonb NOT NULL DEFAULT '{}',
        visibility jsonb NOT NULL DEFAULT '{}',
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (clan_id, user_id)
      );

      CREATE TABLE clan_activity (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL CHECK (kind IN ('activity','announcement')),
        category varchar(16) NOT NULL DEFAULT 'other' CHECK (category IN ('qingming','xiupu','zongqinhui','other')),
        title varchar(120) NOT NULL,
        content text,
        location varchar(200),
        start_at timestamptz,
        end_at timestamptz,
        signup_deadline timestamptz,
        max_participants int,
        allow_signup boolean NOT NULL DEFAULT true,
        pinned boolean NOT NULL DEFAULT false,
        checkin_code varchar(10),
        status varchar(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published','cancelled')),
        created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_clan_activity_clan ON clan_activity (clan_id, created_at DESC);

      CREATE TABLE activity_signup (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_id uuid NOT NULL REFERENCES clan_activity(id) ON DELETE CASCADE,
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        headcount int NOT NULL DEFAULT 1,
        note varchar(200),
        status varchar(16) NOT NULL DEFAULT 'signed' CHECK (status IN ('signed','cancelled')),
        checked_in_at timestamptz,
        checked_in_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (activity_id, user_id)
      );

      CREATE TABLE reminder_date (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        kind varchar(8) NOT NULL CHECK (kind IN ('birth','death')),
        calendar varchar(8) NOT NULL CHECK (calendar IN ('solar','lunar')),
        month int NOT NULL CHECK (month BETWEEN 1 AND 12),
        day int NOT NULL CHECK (day BETWEEN 1 AND 31),
        is_leap_month boolean NOT NULL DEFAULT false,
        year int,
        UNIQUE (person_id, kind)
      );
      CREATE INDEX idx_reminder_date_clan ON reminder_date (clan_id);

      CREATE TABLE reminder_pref (
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        clan_id uuid NOT NULL REFERENCES clan(id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT true,
        birthday boolean NOT NULL DEFAULT true,
        death_anniversary boolean NOT NULL DEFAULT true,
        activity boolean NOT NULL DEFAULT true,
        days_before int NOT NULL DEFAULT 1,
        wechat boolean NOT NULL DEFAULT true,
        PRIMARY KEY (user_id, clan_id)
      );

      CREATE TABLE wechat_subscription (
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        template_id varchar(64) NOT NULL,
        quota int NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, template_id)
      );

      CREATE TABLE notification (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        clan_id uuid REFERENCES clan(id) ON DELETE CASCADE,
        type varchar(24) NOT NULL,
        title varchar(200) NOT NULL,
        body text,
        link jsonb,
        dedupe_key varchar(200) UNIQUE,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_notification_user ON notification (user_id, created_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE notification;
      DROP TABLE wechat_subscription;
      DROP TABLE reminder_pref;
      DROP TABLE reminder_date;
      DROP TABLE activity_signup;
      DROP TABLE clan_activity;
      DROP TABLE contact_card;
    `);
  }
}
