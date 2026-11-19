import 'reflect-metadata';
import { types } from 'pg';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '../config';
import { ENTITIES } from '../entities';
import { M5_ENTITIES } from '../entities/m5';
import { SnakeNamingStrategy } from './naming';
import { Init1731990000000 } from './migrations/1731990000000-Init';
import { ActivationCode1731990100000 } from './migrations/1731990100000-ActivationCode';
import { M5ClanLinkImportDraft1732600000000 } from './migrations/1732600000000-M5ClanLinkImportDraft';
import { M2Heritage1732610000000 } from './migrations/1732610000000-M2Heritage';

// DATE 列按字符串返回，避免时区偏移（族谱日期多为古代日期）
types.setTypeParser(1082, (v: string) => v);

export function dataSourceOptions(url = config.databaseUrl): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [...ENTITIES, ...M5_ENTITIES],
    migrations: [
      Init1731990000000,
      ActivationCode1731990100000,
      M5ClanLinkImportDraft1732600000000,
      M2Heritage1732610000000,
    ],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
  };
}

export const AppDataSource = new DataSource(dataSourceOptions());
