import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse } from '@app/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  loginPage(
    @Query('return_to') returnTo: string | undefined,
    @Res() response: Response,
  ): void {
    const destination =
      typeof returnTo === 'string' && returnTo.startsWith('/oauth/authorize?')
        ? returnTo
        : '/';
    const safeDestination = JSON.stringify(destination).replaceAll(
      '<',
      '\\u003c',
    );
    response.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in · SSO Portal</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#dbeafe 0,#f4f7fb 44%)}main{width:min(100%,420px);background:#fff;border:1px solid #dce3ee;border-radius:20px;padding:32px;box-shadow:0 24px 60px rgba(30,64,175,.12)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}.mark{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#2563eb;color:#fff;font-weight:800}.brand strong{display:block;font-size:17px}.brand span{font-size:13px;color:#667085}h1{margin:0 0 8px;font-size:26px}p{margin:0 0 24px;color:#667085;line-height:1.5}label{display:block;margin:16px 0 7px;font-size:14px;font-weight:650}input{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;outline:none}input:focus{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe}button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.error{min-height:20px;margin:14px 0 0;color:#b42318;font-size:14px}
  </style>
</head>
<body>
  <main>
    <div class="brand"><div class="mark">SSO</div><div><strong>Central Sign-On</strong><span>One account for connected apps</span></div></div>
    <h1>Welcome back</h1>
    <p>Sign in to continue securely to the application.</p>
    <form id="login-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button id="submit" type="submit">Sign in</button>
      <div id="error" class="error" role="alert"></div>
    </form>
  </main>
  <script>
    const destination=${safeDestination};
    const form=document.getElementById('login-form');
    const button=document.getElementById('submit');
    const errorBox=document.getElementById('error');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();
      button.disabled=true;
      errorBox.textContent='';
      try{
        const response=await fetch('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:form.email.value,password:form.password.value})});
        if(!response.ok){
          if(response.status===401)throw new Error('Email or password is incorrect.');
          const body=await response.json();
          throw new Error(body?.error?.message||'Sign-in failed. Please try again.');
        }
        window.location.assign(destination);
      }catch(error){errorBox.textContent=error instanceof Error?error.message:'Sign-in failed. Please try again.';button.disabled=false;}
    });
  </script>
</body>
</html>`);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto);
    response.cookie(this.cookieName, result.token, this.cookieOptions(true));
    return result.auth;
  }

  @Get('session')
  async session(@Req() request: Request): Promise<AuthResponse> {
    const token = this.readToken(request);
    if (!token) {
      throw new UnauthorizedException('A central session is required');
    }

    const auth = await this.sessionService.getValidSession(token);
    if (!auth) {
      throw new UnauthorizedException('The central session is invalid');
    }

    return auth;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.readToken(request);
    if (token) {
      await this.sessionService.revoke(token);
    }
    response.clearCookie(this.cookieName, this.cookieOptions(false));
  }

  private get cookieName(): string {
    return this.configService.getOrThrow<string>('SESSION_COOKIE_NAME');
  }

  private cookieOptions(includeMaxAge: boolean): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      path: '/',
    };

    if (includeMaxAge) {
      options.maxAge =
        this.configService.getOrThrow<number>('SESSION_TTL_SECONDS') * 1000;
    }

    return options;
  }

  private readToken(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) {
      return undefined;
    }

    const token: unknown = (cookies as Record<string, unknown>)[
      this.cookieName
    ];
    return typeof token === 'string' ? token : undefined;
  }
}
