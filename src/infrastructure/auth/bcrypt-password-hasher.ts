import bcrypt from 'bcrypt';
import type { PasswordHasherPort } from '../../application/auth/ports/password-hasher.port.js';

export class BcryptPasswordHasher implements PasswordHasherPort {
  constructor(private readonly rounds = 12) {}
  hash(password: string): Promise<string> { return bcrypt.hash(password, this.rounds); }
  compare(password: string, hash: string): Promise<boolean> { return bcrypt.compare(password, hash); }
}
