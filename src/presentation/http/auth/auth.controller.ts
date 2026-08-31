import type { NextFunction,Request,Response } from 'express';
import type { LoginUseCase } from '../../../application/auth/use-cases/login.use-case.js';
import type { GetCurrentUserUseCase } from '../../../application/auth/use-cases/get-current-user.use-case.js';
import { loginSchema } from './auth.schemas.js';
export class AuthController {
  constructor(private readonly loginUser:LoginUseCase,private readonly current:GetCurrentUserUseCase){}
  login=async(req:Request,res:Response,next:NextFunction)=>{try{res.status(200).json({data:await this.loginUser.execute(loginSchema.parse(req.body))});}catch(e){next(e);}};
  me=async(_req:Request,res:Response,next:NextFunction)=>{try{res.status(200).json({data:await this.current.execute(res.locals.user.id)});}catch(e){next(e);}};
}
