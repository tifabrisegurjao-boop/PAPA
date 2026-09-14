import modelo from '../../planilha/modelo.json'

// Os menus dos formulários são os mesmos da aba Listas da planilha (planilha/modelo.json é a fonte única).
// Quem edita no painel e quem edita na planilha escolhe entre os mesmos valores.
const listas = modelo.listas

export const LISTAS = {
    sistema: listas.sistema,
    vinculo: listas.vinculo,
    tipo: listas.tipo,
    natureza: listas.natureza,
    status: listas.status,
    formaAcesso: listas.formaAcesso,
    conta: listas.conta,
    situacaoAcesso: listas.situacaoCor,
    orgaos: listas.orgao as [string, string][],
}

export const NOME_DO_ORGAO: Record<string, string> = Object.fromEntries(LISTAS.orgaos)
