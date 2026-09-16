import { DomainError } from "../../../shared/errors/domain-error.js";
import type {
  FormaIdentificacao,
  RepresentanteInput,
  RetiradaCommandPort,
  RetiradaQueryPort,
  TipoRetirada,
} from "../ports/retirada.port.js";
export class RegistrarRetiradaUseCase {
  constructor(private readonly port: RetiradaCommandPort) {}
  execute(i: {
    distribuicaoId: string;
    beneficiarioId: string;
    tipo: TipoRetirada;
    formaIdentificacao: FormaIdentificacao | null;
    representante: RepresentanteInput | null;
    justificativaExcecao: string | null;
    usuarioId: string;
    permissoes: readonly string[];
  }) {
    if (
      i.tipo === "REPRESENTANTE" &&
      (!i.representante?.autorizacaoDeclaratoria ||
        i.formaIdentificacao !== "REPRESENTANTE")
    )
      throw new DomainError(
        "REPRESENTANTE_INVALIDO",
        "Representante e autorização declaratória são obrigatórios",
      );
    if (i.tipo !== "REPRESENTANTE" && i.representante)
      throw new DomainError(
        "REPRESENTANTE_INVALIDO",
        "Representante permitido somente nesse tipo",
      );
    if (
      i.tipo === "ANTECIPADA" &&
      (!i.permissoes.includes("RETIRADA_ESTORNAR_QUALQUER") ||
        !i.justificativaExcecao?.trim())
    )
      throw new DomainError(
        i.permissoes.includes("RETIRADA_ESTORNAR_QUALQUER")
          ? "JUSTIFICATIVA_OBRIGATORIA"
          : "PERMISSAO_NEGADA",
        "Antecipação exige autorização superior e justificativa",
      );
    return this.port.registrar(i);
  }
}
export class ListarRetiradasUseCase {
  constructor(private readonly port: RetiradaQueryPort) {}
  execute(i: Parameters<RetiradaQueryPort["listar"]>[0]) {
    return this.port.listar(i);
  }
}
export class ObterRetiradaUseCase {
  constructor(private readonly port: RetiradaQueryPort) {}
  async execute(id: string) {
    const r = await this.port.obter(id);
    if (!r)
      throw new DomainError(
        "RETIRADA_NAO_ENCONTRADA",
        "Retirada não encontrada",
      );
    return r;
  }
}
export class EstornarRetiradaUseCase {
  constructor(private readonly port: RetiradaCommandPort) {}
  async execute(i: {
    retiradaId: string;
    motivo: string;
    usuarioId: string;
    permissoes: readonly string[];
  }) {
    if (!i.motivo.trim())
      throw new DomainError("MOTIVO_OBRIGATORIO", "Motivo obrigatório");
    const c = await this.port.obterContextoEstorno(i.retiradaId);
    if (!c)
      throw new DomainError(
        "RETIRADA_NAO_ENCONTRADA",
        "Retirada não encontrada",
      );
    if (c.status === "ESTORNADA")
      throw new DomainError("RETIRADA_JA_ESTORNADA", "Retirada já estornada");
    const propria = c.operadorId === i.usuarioId && c.mesmoDia;
    const permitida = propria
      ? i.permissoes.includes("RETIRADA_ESTORNAR_PROPRIA") ||
        i.permissoes.includes("RETIRADA_ESTORNAR_QUALQUER")
      : i.permissoes.includes("RETIRADA_ESTORNAR_QUALQUER");
    if (!permitida)
      throw new DomainError("ESTORNO_NAO_AUTORIZADO", "Estorno não autorizado");
    return this.port.estornar({ ...i, motivo: i.motivo.trim() });
  }
}
