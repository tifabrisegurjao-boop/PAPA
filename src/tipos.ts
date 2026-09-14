// Modelo de dados. É o que scripts/converter.mjs gera a partir da planilha v2 (planilha/modelo.json)
// e o que o painel grava no banco (src/lib/repositorio*.ts). Mudou a planilha? Mude o converter e este arquivo juntos.

export type TipoPessoa = 'PF' | 'PJ'

export interface Cliente {
    id: string
    nome: string
    /** null = a planilha não disse se é PF ou PJ; a tela mostra em "Sem classificação". */
    tipoPessoa: TipoPessoa | null
    /** Nº de 4 dígitos do Nexus. Opcional no MVP; base da ligação futura entre os sistemas. */
    numeroNexus?: string
    /** Link compartilhado (https) da pasta do cliente no OneDrive. */
    linkPasta?: string
    observacao?: string
    /** Controle de concorrência do banco: o formulário devolve a versão que leu e a gravação é recusada se mudou. */
    versao?: number
    /** Posição na planilha importada (mantida nas edições). */
    ordem?: number
}

/** Como um processo se liga ao processo de origem (coluna VÍNCULO da planilha). */
export type Vinculo = 'derivado' | 'relacionado'

export interface Movimentacao {
    /** Hora de parede do escritório, `AAAA-MM-DD` ou `AAAA-MM-DDTHH:mm`, sem fuso. */
    dataHora: string
    descricao: string
}

export interface Acesso {
    forma?: string
    conta?: string
    /** SIM/NÃO — abre pelo login SEI GERAL do escritório (coluna ACESSO NO SEI GERAL?). */
    seiGeral?: string
    /** `AAAA-MM-DD` em que o pedido de acesso foi enviado ao órgão. */
    pedidoEm?: string
    /** `AAAA-MM-DD` em que o acesso externo expira. */
    termino?: string
    /** SIM/NÃO — entra na fila semanal de renovação (coluna SOLICITAR RENOVAÇÃO?). */
    renovar?: string
    /** ATIVO / EXPIRADO / SEM INFO / FÍSICO (coluna SITUAÇÃO DO ACESSO). */
    situacao?: string
}

export interface Processo {
    id: string
    clienteId: string
    numero: string
    /** SEI/RO, PJe (TRF1), TCU... Dá nome ao cartão do número. */
    sistema?: string
    /** Vazio = processo principal (ramo autônomo da árvore). `nao-encontrado:<nº>` quando a origem não existe na planilha. */
    processoPaiId?: string
    vinculo?: Vinculo
    orgaoSigla?: string
    orgaoNome?: string
    tipo?: string
    natureza?: string
    objeto?: string
    status?: string
    situacaoAtual?: string
    /** Coluna OBSERVAÇÃO. Regra provisória (11/09/2026): sem SITUAÇÃO ATUAL, o painel mostra isto. */
    observacao?: string
    ultimaMovimentacao?: Movimentacao
    linkProcesso?: string
    codigoCasoNexus?: string
    acesso?: Acesso
    /** Controle de concorrência do banco (ver Cliente.versao). */
    versao?: number
    /** Posição na planilha importada; a árvore e as listas seguem essa ordem. */
    ordem?: number
}

export interface Base {
    geradoEm: string
    modelo?: string
    /** Nome do arquivo de planilha que gerou a base, ou o nome do banco. */
    origem?: string
    clientes: Cliente[]
    processos: Processo[]
    /** Problemas que o conversor encontrou na planilha (nada some do sistema por causa deles). */
    avisos?: string[]
}
