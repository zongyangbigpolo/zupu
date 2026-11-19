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
    let tokenError: string | null = null;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
        const u = await this.users.findOne({ where: { id: payload.sub } });
        if (!u || u.status !== 'active') tokenError = '账号不可用';
        else req.user = { id: u.id, isSuperAdmin: u.isSuperAdmin, phone: u.phone } satisfies AuthUser;
      } catch {
        tokenError = '登录已过期，请重新登录';
      }
    }
    const targets = [ctx.getHandler(), ctx.getClass()];
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ONLY, targets);
    const loginRequired = superOnly || this.reflector.getAllAndOverride<boolean>(LOGIN_REQUIRED, targets);
    // 令牌无效时：需要登录的接口返回 401；公开接口按访客处理（不阻断登录、浏览公开族谱）
    if (loginRequired && !req.user) throw new UnauthorizedException(tokenError ?? '请先登录');
    if (superOnly && !req.user.isSuperAdmin) throw new ForbiddenException('仅平台超级管理员可操作');
    return true;
  }
}
