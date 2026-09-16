export interface Capacidade { capacidade:number; ativos:number; vagas:number; excedente:number; }
export interface CapacidadePort { obter():Promise<Capacidade>; alterar(input:{capacidade:number;justificativa:string;usuarioId:string}):Promise<Capacidade>; }
