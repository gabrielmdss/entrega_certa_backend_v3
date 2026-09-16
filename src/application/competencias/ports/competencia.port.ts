export interface CompetenciaOutput{id:string;ano:number;mes:number;status:string;distribuicoes:number;direitos:number;}
export interface CompetenciaPort{listar():Promise<CompetenciaOutput[]>;obter(id:string):Promise<CompetenciaOutput|null>;gerar(input:{ano:number;mes:number;usuarioId:string}):Promise<CompetenciaOutput>;}
