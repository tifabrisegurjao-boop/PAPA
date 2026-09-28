// Campos aceitos pelo banco e teto de tamanho de cada texto — os MESMOS de firestore.rules
// (tests/importacao.test.ts confere que os dois batem; mudou um, mude o outro).
// Fonte única para o formulário (maxLength + validação antes de enviar) e para o importador
// (que recusa a carga antes de gastar escrita). É .mjs, e não .ts, para o script de importação
// rodar em qualquer Node sem transpilar; limites.d.mts dá os tipos ao TypeScript.

/** Teto de caracteres por campo de texto (regra `texto(campo, max)` / `size() <= max`). */
export const LIMITES = {
    papaClientes: { nome: 200, numeroNexus: 10, linkPasta: 2000, observacao: 5000 },
    papaProcessos: {
        numero: 100, sistema: 60, processoPaiId: 200, orgaoSigla: 60, orgaoNome: 200, tipo: 120, natureza: 60,
        objeto: 5000, status: 60, situacaoAtual: 20000, observacao: 20000, linkProcesso: 2000, codigoCasoNexus: 40,
    },
}

/** Campos que um documento pode ter, fora os de controle (versao, atualizadoEm, atualizadoPor) — regra `keys().hasOnly`. */
export const CHAVES = {
    papaClientes: ['nome', 'tipoPessoa', 'numeroNexus', 'linkPasta', 'observacao', 'ordem'],
    papaProcessos: [
        'clienteId', 'numero', 'sistema', 'processoPaiId', 'vinculo', 'orgaoSigla', 'orgaoNome', 'tipo', 'natureza', 'objeto',
        'status', 'situacaoAtual', 'observacao', 'ultimaMovimentacao', 'linkProcesso', 'codigoCasoNexus', 'acesso', 'ordem',
    ],
}

/** Campos de controle que o gravador acrescenta (e as regras exigem). */
export const CHAVES_DE_CONTROLE = ['versao', 'atualizadoEm', 'atualizadoPor']

/** Mensagem de erro para o formulário quando um texto passa do teto; undefined quando cabe. */
export function erroTamanho(colecao, campo, valor) {
    const max = LIMITES[colecao]?.[campo]
    if (max === undefined || typeof valor !== 'string' || valor.length <= max) return undefined
    return `Passou do tamanho: ${valor.length} caracteres (máximo ${max}).`
}
