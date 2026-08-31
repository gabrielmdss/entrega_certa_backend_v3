import jwt, { type SignOptions } from 'jsonwebtoken';
import type { TokenPayload, TokenServicePort } from '../../application/auth/ports/token-service.port.js';

export class JwtTokenService implements TokenServicePort {
  constructor(private readonly secret: string, private readonly expiresIn: NonNullable<SignOptions['expiresIn']>) {}
  async sign(payload: TokenPayload): Promise<string> {
    return jwt.sign({}, this.secret, { subject: payload.subject, expiresIn: this.expiresIn });
  }
  async verify(token: string): Promise<TokenPayload> {
    const decoded = jwt.verify(token, this.secret);
    if (typeof decoded === 'string' || !decoded.sub) throw new Error('Token inválido');
    return { subject: decoded.sub };
  }
}
