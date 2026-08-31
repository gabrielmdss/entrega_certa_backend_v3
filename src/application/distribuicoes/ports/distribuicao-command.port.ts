export interface DistribuicaoCommandPort {
  abrir(i: { id: string; usuarioId: string }): Promise<void>;
  encerrar(i: { id: string; usuarioId: string }): Promise<void>;
}
