import { MigrationInterface, QueryRunner } from 'typeorm';

/** 预建账号（被任命的管理员 / 被邀请的族人）需凭激活码设置密码，防止他人抢注手机号 */
export class ActivationCode1731990100000 implements MigrationInterface {
  name = 'ActivationCode1731990100000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE app_user ADD COLUMN activation_code_hash varchar(100);
      ALTER TABLE app_user ADD COLUMN activation_expires_at timestamptz;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE app_user DROP COLUMN activation_code_hash, DROP COLUMN activation_expires_at;`);
  }
}
