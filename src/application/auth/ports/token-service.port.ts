export interface TokenPayload { subject: string; }
export interface TokenServicePort {
  sign(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<TokenPayload>;
}
