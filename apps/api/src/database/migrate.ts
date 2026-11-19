import { AppDataSource } from './data-source';

async function main() {
  await AppDataSource.initialize();
  const done = await AppDataSource.runMigrations({ transaction: 'each' });
  console.log(`迁移完成：${done.map((m) => m.name).join(', ') || '无新迁移'}`);
  await AppDataSource.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
