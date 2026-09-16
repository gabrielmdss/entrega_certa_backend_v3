import type { NextFunction,Request,Response } from 'express';
import type { LoginUseCase } from '../../../application/auth/use-cases/login.use-case.js';
import type { GetCurrentUserUseCase } from '../../../application/auth/use-cases/get-current-user.use-case.js';
import type { AlterarSenhaUseCase } from '../../../application/auth/use-cases/alterar-senha.use-case.js';
import { alterarSenhaSchema, loginSchema } from './auth.schemas.js';
export class AuthController {
  constructor(private readonly loginUser:LoginUseCase,private readonly current:GetCurrentUserUseCase,private readonly alterarSenha:AlterarSenhaUseCase){}
  login=async(req:Request,res:Response,next:NextFunction)=>{try{res.status(200).json({data:await this.loginUser.execute(loginSchema.parse(req.body))});}catch(e){next(e);}};
  me=async(_req:Request,res:Response,next:NextFunction)=>{try{res.status(200).json({data:await this.current.execute(res.locals.user.id)});}catch(e){next(e);}};
  senha=async(req:Request,res:Response,next:NextFunction)=>{try{const b=alterarSenhaSchema.parse(req.body);await this.alterarSenha.execute({usuarioId:res.locals.user.id,...b});res.status(204).send();}catch(e){next(e);}};
}
