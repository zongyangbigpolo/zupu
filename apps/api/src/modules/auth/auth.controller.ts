import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities';
import { AuthUser, CurrentUser, LoginRequired } from '../../common/auth';
import { AuthService, toUserInfo } from './auth.service';

class LoginDto {
  @IsString() account: string;
  @IsString() password: string;
}

class RegisterDto {
  @IsString() phone: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto.account.trim(), dto.password);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.phone.trim(), dto.password, dto.displayName);
  }

  @Get('me')
  @LoginRequired()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.users.findOne({ where: { id: user.id } });
    if (!u) throw new NotFoundException();
    return toUserInfo(u);
  }
}
