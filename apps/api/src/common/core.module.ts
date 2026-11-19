import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../entities';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { StorageService } from './storage.service';
import { KinshipCache } from './kinship-cache.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [AccessService, AuditService, StorageService, KinshipCache],
  exports: [TypeOrmModule, AccessService, AuditService, StorageService, KinshipCache],
})
export class CoreModule {}
