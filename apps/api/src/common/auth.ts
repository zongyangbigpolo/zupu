import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities';

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
  phone: string | null;
}

export interface JwtPayload {
  sub: string;
  /** 登录方式：password / wechat(预留) / sms(预留) */
  via: string;
}

const LOGIN_REQUIRED = 'loginRequired';
const SUPER_ONLY = 'superOnly';

/** 必须登录 */
export const LoginRequired = () => SetMetadata(LOGIN_REQUIRED, true);
/** 仅平台超级管理员 */
export const SuperAdminOnly = () => SetMetadata(SUPER_ONLY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  return ctx.switchToHttp().getRequest().user ?? null;
});

/** 全局守卫：有令牌则解析用户；按装饰器要求登录或超级管理员 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    req.user = null;
    if (header?.startsWith('Bearer ')) {
      let payload: JwtPayload;
      try {
        payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      } catch {
        throw new UnauthorizedException('登录已过期，请重新登录');
      }
      const u = await this.users.findOne({ where: { id: payload.sub } });
      if (!u || u.status !== 'active') throw new UnauthorizedException('账号不可用');
      req.user = { id: u.id, isSuperAdmin: u.isSuperAdmin, phone: u.phone } satisfies AuthUser;
    }
    const targets = [ctx.getHandler(), ctx.getClass()];
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ONLY, targets);
    const loginRequired = superOnly || this.reflector.getAllAndOverride<boolean>(LOGIN_REQUIRED, targets);
    if (loginRequired && !req.user) throw new UnauthorizedException('请先登录');
    if (superOnly && !req.user.isSuperAdmin) throw new ForbiddenException('仅平台超级管理员可操作');
    return true;
  }
}
