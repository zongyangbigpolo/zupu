import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import type { AuthResult, UserInfo } from '@zupu/shared';
import { UserEntity } from '../../entities';
import type { JwtPayload } from '../../common/auth';

export const PHONE_RE = /^1\d{10}$/;

export function toUserInfo(u: UserEntity): UserInfo {
  return { id: u.id, phone: u.phone, email: u.email, displayName: u.displayName, isSuperAdmin: u.isSuperAdmin };
}

/**
 * 认证服务。登录方式可插拔：M1 为密码登录；
 * M4 微信小程序登录在此新增 loginWithWechat(code)（按 wechat_openid/unionid 查找或绑定用户），签发同样的 JWT。
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly jwt: JwtService,
  ) {}

  async issue(user: UserEntity, via: string): Promise<AuthResult> {
    const payload: JwtPayload = { sub: user.id, via };
    return { token: await this.jwt.signAsync(payload), user: toUserInfo(user) };
  }

  async loginWithPassword(account: string, password: string): Promise<AuthResult> {
    const where = account.includes('@') ? { email: account.toLowerCase() } : { phone: account };
    const u = await this.users.findOne({ where });
    if (!u || !u.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (u.status !== 'active') throw new UnauthorizedException('账号已停用');
    return this.issue(u, 'password');
  }

  /** 注册；若该手机号已被超级管理员/家族管理员预先登记（尚未设密码），则直接激活 */
  async register(phone: string, password: string, displayName?: string): Promise<AuthResult> {
    if (!PHONE_RE.test(phone)) throw new BadRequestException('手机号格式不正确');
    if (!password || password.length < 6) throw new BadRequestException('密码至少 6 位');
    let u = await this.users.findOne({ where: { phone } });
    if (u?.passwordHash) throw new ConflictException('该手机号已注册，请直接登录');
    const passwordHash = await bcrypt.hash(password, 10);
    if (u) {
      u.passwordHash = passwordHash;
      if (displayName) u.displayName = displayName;
      u = await this.users.save(u);
    } else {
      u = await this.users.save(this.users.create({ phone, passwordHash, displayName: displayName ?? null }));
    }
    return this.issue(u, 'password');
  }

  /** 按手机号查找用户，不存在则建一个待激活账号（用于任命管理员、添加族人） */
  async findOrCreateByPhone(phone: string, displayName?: string | null): Promise<UserEntity> {
    if (!PHONE_RE.test(phone)) throw new BadRequestException('手机号格式不正确');
    const u = await this.users.findOne({ where: { phone } });
    if (u) return u;
    return this.users.save(this.users.create({ phone, displayName: displayName ?? null, passwordHash: null }));
  }

  hashPassword(p: string) {
    return bcrypt.hash(p, 10);
  }
}
