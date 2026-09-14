// npm run dados -- caminho/da/planilha.xlsx [saida.json]
// Lê a planilha do modelo v2 (abas Clientes, Processos e Listas — ver planilha/modelo.json) e grava o JSON
// que o sistema carrega (dados/base.json — fora de public/, servida só no dev e na demo). Nada some: linha com problema entra no JSON e vira aviso.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODELO = JSON.parse(readFileSync(resolve(RAIZ, 'planilha/modelo.json'), 'utf8'))

const [origem, saida = 'dados/base.json'] = process.argv.slice(2)
if (!origem) {
    console.error('Uso: npm run dados -- planilha.xlsx [saida.json]')
    process.exit(1)
}

// Mesma chave do sistema (src/lib/busca.ts) e do gerador (planilha/gerar_planilha.py).
const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.,\-/_]+/g, ' ').replace(/\s+/g, ' ').trim()
const idDe = t => normalizar(t).replace(/ /g, '-')

const avisos = []
const avisar = (aba, linha, texto) => avisos.push(`${aba} L${linha}: ${texto}`)

// Data do Excel é um número de dias desde 30/12/1899. Converter na mão, sem `new Date`, mantém a data
// digitada em qualquer fuso do computador. Hora só quando foi digitada (fração do dia ≠ 0).
function serialParaIso(serial) {
    const dias = Math.floor(serial)
    const ms = Date.UTC(1899, 11, 30) + dias * 86400000
    const d = new Date(ms)
    const p = n => String(n).padStart(2, '0')
    const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
    const minutos = Math.round((serial - dias) * 1440)
    return minutos ? `${base}T${p(Math.floor(minutos / 60))}:${p(minutos % 60)}` : base
}

const texto = cel => (cel == null || cel.t === 'e' ? '' : String(cel.v ?? '').trim())

function lerData(cel, aba, linha, titulo) {
    if (cel == null || cel.v === '' || cel.v == null) return ''
    if (cel.t === 'n') return serialParaIso(cel.v)
    if (cel.t === 'd') return serialParaIso((cel.v.getTime() - Date.UTC(1899, 11, 30)) / 86400000)
    const t = texto(cel)
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
    if (m) {
        avisar(aba, linha, `${titulo} está como texto ("${t}"); use uma data de verdade`)
        return `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}:${m[5]}` : ''}`
    }
    avisar(aba, linha, `${titulo} não é uma data ("${t}") — ignorada`)
    return ''
}

function lerAba(wb, nome, colunas) {
    const ws = wb.Sheets[nome]
    if (!ws || !ws['!ref']) throw new Error(`A planilha não tem a aba "${nome}". Confira se é o modelo v${MODELO.versao}.`)
    const faixa = XLSX.utils.decode_range(ws['!ref'])
    // Mapeia pelo TÍTULO do cabeçalho (sem o " *" de obrigatório), não pela posição: sobrevive a coluna inserida.
    const posicao = {}
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
        const t = texto(ws[XLSX.utils.encode_cell({ r: 0, c })]).replace(/\s*\*$/, '')
        if (t) posicao[normalizar(t)] = c
    }
    const faltando = colunas.filter(col => !col.formula && !(normalizar(col.titulo) in posicao)).map(c => c.titulo)
    if (faltando.length) throw new Error(`Aba "${nome}" sem as colunas: ${faltando.join(', ')}. Confira se é o modelo v${MODELO.versao}.`)
    const linhas = []
    for (let r = 1; r <= faixa.e.r; r++) {
        const reg = { _linha: r + 1 }
        for (const col of colunas) {
            if (col.formula) continue
            const cel = ws[XLSX.utils.encode_cell({ r, c: posicao[normalizar(col.titulo)] })]
            reg[col.chave] = col.tipo === 'data' ? lerData(cel, nome, r + 1, col.titulo) : texto(cel)
        }
        if (Object.entries(reg).some(([k, v]) => k !== '_linha' && v)) linhas.push(reg)
    }
    return linhas
}

function lerOrgaos(wb) {
    const ws = wb.Sheets[MODELO.abas.listas]
    const nomes = {}
    if (!ws || !ws['!ref']) return nomes
    const faixa = XLSX.utils.decode_range(ws['!ref'])
    let colSigla = -1
    for (let c = faixa.s.c; c <= faixa.e.c; c++) if (/^ÓRGÃO \(sigla\)/i.test(texto(ws[XLSX.utils.encode_cell({ r: 0, c })]))) colSigla = c
    if (colSigla < 0) return nomes
    for (let r = 1; r <= faixa.e.r; r++) {
        const sigla = texto(ws[XLSX.utils.encode_cell({ r, c: colSigla })])
        if (sigla) nomes[sigla] = texto(ws[XLSX.utils.encode_cell({ r, c: colSigla + 1 })])
    }
    return nomes
}

// XLSX.read com o buffer (e não readFile): o build ESM do SheetJS não enxerga o fs do Node sem configuração extra.
const wb = XLSX.read(readFileSync(resolve(origem)), { cellDates: false })
const linhasClientes = lerAba(wb, MODELO.abas.clientes, MODELO.colunas.clientes)
const linhasProcessos = lerAba(wb, MODELO.abas.processos, MODELO.colunas.processos)
const orgaos = lerOrgaos(wb)

// ── clientes ──
const clientes = []
const clientePorChave = new Map()
for (const l of linhasClientes) {
    if (!l.nome) { avisar('Clientes', l._linha, 'linha sem nome — ignorada'); continue }
    const chave = normalizar(l.nome)
    if (clientePorChave.has(chave)) { avisar('Clientes', l._linha, `cliente repetido: "${l.nome}" — usada a primeira linha`); continue }
    const tipo = l.tipoPessoa.toUpperCase()
    if (!['PF', 'PJ'].includes(tipo)) avisar('Clientes', l._linha, `"${l.nome}" sem PF/PJ — vai aparecer em "Sem classificação"`)
    const c = { id: `c-${idDe(l.nome)}`, nome: l.nome, tipoPessoa: ['PF', 'PJ'].includes(tipo) ? tipo : null }
    c.ordem = clientes.length
    if (l.numeroNexus) c.numeroNexus = l.numeroNexus
    if (l.observacao) c.observacao = l.observacao
    if (/^https?:\/\//i.test(l.linkPasta)) c.linkPasta = l.linkPasta
    else if (l.linkPasta) avisar('Clientes', l._linha, `link da pasta de "${l.nome}" não é um endereço https:// — ignorado`)
    clientes.push(c)
    clientePorChave.set(chave, c)
}

// ── processos ──
const processos = []
const idsUsados = new Map()
const idPorNumero = new Map()
for (const l of linhasProcessos) {
    if (!l.numero) { avisar('Processos', l._linha, 'linha sem nº do processo — ignorada'); continue }
    let cliente = clientePorChave.get(normalizar(l.cliente))
    if (!cliente) {
        if (!l.cliente) { avisar('Processos', l._linha, `processo ${l.numero} sem cliente — ignorado`); continue }
        avisar('Processos', l._linha, `cliente "${l.cliente}" não está na aba Clientes — criado sem PF/PJ`)
        cliente = { id: `c-${idDe(l.cliente)}`, nome: l.cliente, tipoPessoa: null }
        clientes.push(cliente)
        clientePorChave.set(normalizar(l.cliente), cliente)
    }
    let id = `p-${idDe(l.numero)}`
    const vezes = (idsUsados.get(id) ?? 0) + 1
    idsUsados.set(id, vezes)
    if (vezes > 1) { avisar('Processos', l._linha, `nº ${l.numero} repetido — mantido como registro separado`); id += `-${vezes}` }
    else idPorNumero.set(normalizar(l.numero), id)
    const p = { id, clienteId: cliente.id, numero: l.numero, ordem: processos.length }
    // situacaoAtual e observacao vão separados; a regra provisória "sem SITUAÇÃO ATUAL, mostra a OBSERVAÇÃO" fica na tela.
    for (const chave of ['sistema', 'tipo', 'natureza', 'objeto', 'status', 'situacaoAtual', 'observacao', 'codigoCasoNexus']) if (l[chave]) p[chave] = l[chave]
    if (l.orgao) { p.orgaoSigla = l.orgao; if (orgaos[l.orgao]) p.orgaoNome = orgaos[l.orgao] }
    if (l.origem) p._origem = l.origem
    if (l.vinculo) p.vinculo = /relac/i.test(l.vinculo) ? 'relacionado' : 'derivado'
    if (l.ultimaMovData || l.ultimaMovDescricao) p.ultimaMovimentacao = { dataHora: l.ultimaMovData, descricao: l.ultimaMovDescricao }
    if (/^https?:\/\//i.test(l.url)) p.linkProcesso = l.url
    else if (l.url) avisar('Processos', l._linha, `link do processo ${l.numero} não é um endereço https:// — ignorado`)
    const acesso = {}
    if (l.formaAcesso) acesso.forma = l.formaAcesso
    if (l.conta) acesso.conta = l.conta
    if (l.acessoSeiGeral) acesso.seiGeral = l.acessoSeiGeral.toUpperCase()
    if (l.dataPedidoAcesso) acesso.pedidoEm = l.dataPedidoAcesso
    if (l.terminoAcesso) acesso.termino = l.terminoAcesso
    if (l.renovar) acesso.renovar = l.renovar.toUpperCase()
    if (l.situacaoAcesso) acesso.situacao = l.situacaoAcesso
    if (Object.keys(acesso).length) p.acesso = acesso
    processos.push({ ...p, _linha: l._linha })
}
for (const p of processos) {
    if (p._origem) {
        const paiId = idPorNumero.get(normalizar(p._origem))
        if (!paiId) avisar('Processos', p._linha, `origem "${p._origem}" do processo ${p.numero} não existe na planilha — mostrado como principal`)
        else if (processos.find(x => x.id === paiId)?.clienteId !== p.clienteId) avisar('Processos', p._linha, `origem "${p._origem}" do processo ${p.numero} é de outro cliente`)
        p.processoPaiId = paiId ?? `nao-encontrado:${p._origem}`
        if (!p.vinculo) p.vinculo = 'derivado'
    } else if (p.vinculo) avisar('Processos', p._linha, `processo ${p.numero} tem VÍNCULO sem PROCESSO DE ORIGEM — vínculo ignorado`)
    delete p._origem
    delete p._linha
}

const base = {
    geradoEm: new Date().toISOString().slice(0, 16),
    modelo: MODELO.versao,
    origem: origem.replace(/\\/g, '/').split('/').pop(),
    clientes,
    processos,
    avisos,
}
const destino = resolve(RAIZ, saida)
mkdirSync(dirname(destino), { recursive: true })
writeFileSync(destino, JSON.stringify(base, null, 2) + '\n')
console.log(`✔ ${saida}: ${clientes.length} clientes, ${processos.length} processos, ${avisos.length} avisos`)
for (const a of avisos) console.log('  ⚠ ' + a)
