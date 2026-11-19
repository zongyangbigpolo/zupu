import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import type { AuthResult, WechatLoginResult, WechatPublicConfig } from '@zupu/shared';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { config } from '../../config';
import { UserEntity, WechatSubscriptionEntity } from '../../entities';
import { AuthService, PHONE_RE } from '../auth/auth.service';

export interface WechatSession {
  openid: string;
  unionid: string | null;
}

export interface SubscribeMessage {
  openid: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string }>;
}

const API = 'https://api.weixin.qq.com';
const MAX_QUOTA = 50;

/**
 * 微信开放接口封装：code2session、手机号快速验证、订阅消息。
 * 开发 / 测试环境未配置 AppID 时自动进入模拟模式（不访问微信服务器）：
 * - code2session：openid = "mock-" + code
 * - 手机号：phoneCode 形如 "mock-phone-13900000002"
 * - 订阅消息：记录到 sentMessages，并写日志
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger('Wechat');
  private token: { value: string; expiresAt: number } | null = null;
  /** 模拟模式下发送的订阅消息（测试断言用） */
  readonly sentMessages: SubscribeMessage[] = [];

  get mock() {
    return config.wechat.mock;
  }

  templates() {
    return {
      reminder: config.wechat.tplReminder || (this.mock ? 'mock-tpl-reminder' : null),
      activity: config.wechat.tplActivity || (this.mock ? 'mock-tpl-activity' : null),
    };
  }

  private ensureConfigured() {
    if (!this.mock && (!config.wechat.appId || !config.wechat.secret)) {
      throw new ServiceUnavailableException('服务器未配置微信小程序 AppID / AppSecret');
    }
  }

  async code2session(code: string): Promise<WechatSession> {
    this.ensureConfigured();
    if (this.mock) {
      if (!/^[\w-]{1,64}$/.test(code)) throw new BadRequestException('无效的微信登录 code');
      return { openid: `mock-${code}`.slice(0, 64), unionid: null };
    }
    const q = new URLSearchParams({ appid: config.wechat.appId, secret: config.wechat.secret, js_code: code, grant_type: 'authorization_code' });
    const r = (await (await fetch(`${API}/sns/jscode2session?${q}`)).json()) as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    if (!r.openid) {
      this.logger.warn(`code2session 失败：${r.errcode} ${r.errmsg}`);
      throw new UnauthorizedException('微信登录失败，请重试');
    }
    return { openid: r.openid, unionid: r.unionid ?? null };
  }

  /** 手机号快速验证组件（getPhoneNumber）返回的 code → 手机号 */
  async phoneFromCode(phoneCode: string): Promise<string> {
    this.ensureConfigured();
    if (this.mock) {
      const m = /^mock-phone-(1\d{10})$/.exec(phoneCode);
      if (!m) throw new BadRequestException('无效的手机号授权');
      return m[1];
    }
    const r = (await (
      await fetch(`${API}/wxa/business/getuserphonenumber?access_token=${await this.accessToken()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: phoneCode }),
      })
    ).json()) as { errcode?: number; errmsg?: string; phone_info?: { purePhoneNumber?: string; countryCode?: string } };
    const phone = r.phone_info?.purePhoneNumber;
    if (!phone) {
      this.logger.warn(`getuserphonenumber 失败：${r.errcode} ${r.errmsg}`);
      throw new BadRequestException('获取手机号失败');
    }
    if (r.phone_info?.countryCode && r.phone_info.countryCode !== '86') throw new BadRequestException('暂只支持中国大陆手机号');
    return phone;
  }

  /** 发送订阅消息；失败只记日志，返回是否成功 */
  async sendSubscribeMessage(msg: SubscribeMessage): Promise<boolean> {
    if (this.mock) {
      this.sentMessages.push(msg);
      if (this.sentMessages.length > 500) this.sentMessages.shift();
      this.logger.log(`[模拟] 订阅消息 → ${msg.openid} ${msg.templateId} ${JSON.stringify(msg.data)}`);
      return true;
    }
    try {
      const r = (await (
        await fetch(`${API}/cgi-bin/message/subscribe/send?access_token=${await this.accessToken()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: msg.openid,
            template_id: msg.templateId,
            page: msg.page,
            data: msg.data,
            miniprogram_state: config.wechat.miniprogramState,
            lang: 'zh_CN',
          }),
        })
      ).json()) as { errcode?: number; errmsg?: string };
      if (r.errcode) this.logger.warn(`订阅消息发送失败：${r.errcode} ${r.errmsg}`);
      return !r.errcode;
    } catch (e) {
      this.logger.warn(`订阅消息发送异常：${(e as Error).message}`);
      return false;
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const q = new URLSearchParams({ grant_type: 'client_credential', appid: config.wechat.appId, secret: config.wechat.secret });
    const r = (await (await fetch(`${API}/cgi-bin/token?${q}`)).json()) as { access_token?: string; expires_in?: number; errmsg?: string };
    if (!r.access_token) throw new ServiceUnavailableException(`获取微信 access_token 失败：${r.errmsg}`);
    this.token = { value: r.access_token, expiresAt: Date.now() + ((r.expires_in ?? 7200) - 300) * 1000 };
    return r.access_token;
  }
}

/** 微信订阅消息额度（一次性订阅：用户每同意一次可发一条） */
@Injectable()
export class WechatQuotaService {
  constructor(@InjectRepository(WechatSubscriptionEntity) private readonly subs: Repository<WechatSubscriptionEntity>) {}

  async add(userId: string, templateIds: string[]) {
    for (const templateId of new Set(templateIds)) {
      await this.subs.query(
        `INSERT INTO wechat_subscription (user_id, template_id, quota) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, template_id) DO UPDATE SET quota = LEAST(wechat_subscription.quota + 1, $3)`,
        [userId, templateId, MAX_QUOTA],
      );
    }
  }

  async get(userId: string, templateId: string | null): Promise<number> {
    if (!templateId) return 0;
    return (await this.subs.findOne({ where: { userId, templateId } }))?.quota ?? 0;
  }

  /** 原子地扣减一次额度，成功返回 true */
  async consume(userId: string, templateId: string): Promise<boolean> {
    const r = await this.subs.query(
      `UPDATE wechat_subscription SET quota = quota - 1 WHERE user_id = $1 AND template_id = $2 AND quota > 0 RETURNING quota`,
      [userId, templateId],
    );
    // pg 驱动对 UPDATE ... RETURNING 返回 [rows, count]
    const rows = Array.isArray(r[0]) ? r[0] : r;
    return rows.length > 0;
  }

  /** 发送失败时退还额度 */
  async refund(userId: string, templateId: string) {
    await this.subs.query(`UPDATE wechat_subscription SET quota = quota + 1 WHERE user_id = $1 AND template_id = $2`, [userId, templateId]);
  }
}

class WechatCodeDto {
  @IsString() @MaxLength(128) code: string;
}

class WechatBindDto {
  @IsString() bindToken: string;
  @IsOptional() @IsString() @MaxLength(128) phoneCode?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() @MaxLength(10) activationCode?: string;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
}

class SubscriptionsDto {
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @Matches(/^[\w-]{1,64}$/, { each: true }) templateIds: string[];
}

interface BindPayload {
  typ: 'wechat-bind';
  openid: string;
  unionid: string | null;
}

/** 绑定令牌用独立密钥签发，不能当作登录令牌使用 */
const bindSecret = () => `${config.jwtSecret}:wechat-bind`;

@Controller()
export class WechatController {
  constructor(
    private readonly wechat: WechatService,
    private readonly quota: WechatQuotaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  @Get('wechat/config')
  publicConfig(): WechatPublicConfig {
    return { templates: this.wechat.templates(), mock: this.wechat.mock };
  }

  /** 小程序 wx.login 得到的 code → 已绑定则直接登录，否则返回绑定令牌 */
  @Post('auth/wechat/login')
  async login(@Body() dto: WechatCodeDto): Promise<WechatLoginResult> {
    const s = await this.wechat.code2session(dto.code);
    const u = await this.findByWechat(s);
    if (u) {
      if (u.status !== 'active') throw new UnauthorizedException('账号已停用');
      if (s.unionid && !u.wechatUnionid) await this.users.update(u.id, { wechatUnionid: s.unionid });
      return { status: 'ok', ...(await this.auth.issue(u, 'wechat')) };
    }
    const payload: BindPayload = { typ: 'wechat-bind', openid: s.openid, unionid: s.unionid };
    return { status: 'need_bind', bindToken: await this.jwt.signAsync(payload, { secret: bindSecret(), expiresIn: '15m' }) };
  }

  /**
   * 把微信绑定到账号（按手机号合并）：
   * 1. phoneCode：微信手机号快速验证，手机号已存在则绑定到该账号，否则新建账号；
   * 2. phone + password：已有账号；
   * 3. phone + activationCode + password：管理员预先登记、尚未激活的账号。
   */
  @Post('auth/wechat/bind')
  async bind(@Body() dto: WechatBindDto): Promise<AuthResult> {
    let p: BindPayload;
    try {
      p = await this.jwt.verifyAsync<BindPayload>(dto.bindToken, { secret: bindSecret() });
    } catch {
      throw new UnauthorizedException('绑定已过期，请重新登录');
    }
    if (p.typ !== 'wechat-bind' || !p.openid) throw new UnauthorizedException('绑定令牌无效');
    if (await this.findByWechat(p)) throw new ConflictException('该微信已绑定其他账号');

    let user: UserEntity | null = null;
    if (dto.phoneCode) {
      const phone = await this.wechat.phoneFromCode(dto.phoneCode);
      user = await this.users.findOne({ where: { phone } });
      if (!user) user = await this.users.save(this.users.create({ phone, displayName: dto.displayName ?? null, passwordHash: null }));
      else if (user.activationCodeHash) {
        // 手机号已由微信验证，等同于完成激活
        user.activationCodeHash = null;
        user.activationExpiresAt = null;
        user = await this.users.save(user);
      }
    } else if (dto.phone && dto.password) {
      const phone = dto.phone.trim();
      if (!PHONE_RE.test(phone)) throw new BadRequestException('手机号格式不正确');
      if (dto.activationCode) {
        const r = await this.auth.register(phone, dto.password, dto.displayName, dto.activationCode);
        user = await this.users.findOne({ where: { id: r.user.id } });
      } else {
        user = await this.users.findOne({ where: { phone } });
        if (!user || !user.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
          throw new UnauthorizedException('账号或密码错误');
        }
      }
    } else {
      throw new BadRequestException('请授权手机号，或填写手机号和密码');
    }
    if (!user) throw new UnauthorizedException('账号不存在');
    if (user.status !== 'active') throw new UnauthorizedException('账号已停用');
    if (user.wechatOpenid && user.wechatOpenid !== p.openid) throw new ConflictException('该账号已绑定其他微信，请先在原微信中解绑');
    user.wechatOpenid = p.openid;
    if (p.unionid) user.wechatUnionid = p.unionid;
    user = await this.users.save(user);
    return this.auth.issue(user, 'wechat');
  }

  /** 已登录用户绑定当前微信 */
  @Post('auth/wechat/bind-current')
  @LoginRequired()
  async bindCurrent(@CurrentUser() me: AuthUser, @Body() dto: WechatCodeDto) {
    const s = await this.wechat.code2session(dto.code);
    const other = await this.findByWechat(s);
    if (other && other.id !== me.id) throw new ConflictException('该微信已绑定其他账号');
    const u = await this.users.findOneOrFail({ where: { id: me.id } });
    if (u.wechatOpenid && u.wechatOpenid !== s.openid) throw new ConflictException('该账号已绑定其他微信，请先解绑');
    await this.users.update(me.id, { wechatOpenid: s.openid, wechatUnionid: s.unionid ?? u.wechatUnionid });
    return { ok: true };
  }

  @Delete('auth/wechat')
  @LoginRequired()
  async unbind(@CurrentUser() me: AuthUser) {
    await this.users.update(me.id, { wechatOpenid: null, wechatUnionid: null });
    return { ok: true };
  }

  /** 用户在小程序中同意订阅的模板（每同意一次 +1 次发送额度） */
  @Post('wechat/subscriptions')
  @LoginRequired()
  async subscribe(@CurrentUser() me: AuthUser, @Body() dto: SubscriptionsDto) {
    const t = this.wechat.templates();
    const allowed = new Set([t.reminder, t.activity].filter(Boolean));
    await this.quota.add(me.id, dto.templateIds.filter((id) => allowed.has(id)));
    return { reminder: await this.quota.get(me.id, t.reminder), activity: await this.quota.get(me.id, t.activity) };
  }

  private async findByWechat(s: { openid: string; unionid: string | null }) {
    return (
      (await this.users.findOne({ where: { wechatOpenid: s.openid } })) ??
      (s.unionid ? await this.users.findOne({ where: { wechatUnionid: s.unionid } }) : null)
    );
  }
}

@Module({
  controllers: [WechatController],
  providers: [WechatService, WechatQuotaService],
  exports: [WechatService, WechatQuotaService],
})
export class WechatModule {}
