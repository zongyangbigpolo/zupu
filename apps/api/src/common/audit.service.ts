import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from '../entities';

export interface AuditInput {
  clanId: string | null;
  userId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>) {}

  async log(input: AuditInput, em?: EntityManager) {
    const r = em ? em.getRepository(AuditLogEntity) : this.repo;
    await r.insert({
      ...input,
      before: (strip(input.before) ?? null) as any,
      after: (strip(input.after) ?? null) as any,
    });
  }
}

function strip(v: unknown) {
  if (!v || typeof v !== 'object') return v;
  const { passwordHash, ...rest } = v as Record<string, unknown>;
  void passwordHash;
  return rest;
}
