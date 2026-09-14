// npm run dados:enriquecer-demo -- [base.json]
// SÓ PARA A BASE FICTÍCIA DA DEMO: deixa as pastas "cheias" para apresentação e testes em escala.
//   1. preenche o que falta em cada processo (tipo, natureza, objeto, órgão, status, situação atual,
//      última movimentação, link e prazo de acesso) com textos plausíveis de rotina administrativa;
//   2. acrescenta desdobramentos (recursos, comunicações, manifestações, certidões) a parte dos processos
//      principais — alguns com um segundo nível — e um segundo processo principal a parte dos clientes.
// Determinístico (semente fixa): rodar de novo não duplica nada nem muda o que já foi gerado.
// Nunca rode isto numa base real — tudo aqui é inventado.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODELO = JSON.parse(readFileSync(resolve(RAIZ, 'planilha/modelo.json'), 'utf8'))
const NOME_DO_ORGAO = Object.fromEntries(MODELO.listas.orgao)
const arquivo = resolve(RAIZ, process.argv[2] ?? 'dados/base.json')
const base = JSON.parse(readFileSync(arquivo, 'utf8'))

// ── sorteio determinístico ────────────────────────────────────────────────────────────────
let semente = 20260914
const rnd = () => { semente |= 0; semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const escolher = lista => lista[Math.floor(rnd() * lista.length)]
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const dig = n => String(Math.floor(rnd() * 10 ** n)).padStart(n, '0')
const p2 = n => String(n).padStart(2, '0')
const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,\-/_]+/g, ' ').replace(/\s+/g, ' ').trim()
const idProcesso = numero => `p-${normalizar(numero).replace(/ /g, '-')}`

/** Data de parede AAAA-MM-DD entre dois dias (inclusive), sem fuso. */
function dataEntre(inicio, fim) {
    const a = Date.UTC(...inicio.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)))
    const b = Date.UTC(...fim.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)))
    const d = new Date(a + Math.floor(rnd() * ((b - a) / 86400000 + 1)) * 86400000)
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`
}
const br = iso => iso.slice(0, 10).split('-').reverse().join('/')
const HOJE = '2026-09-14'

// ── textos por tipo ───────────────────────────────────────────────────────────────────────
const NATUREZA = { 'Processo Administrativo Disciplinar (PAD)': 'Disciplinar', 'Processo Administrativo Preliminar': 'Disciplinar', 'Sindicância': 'Disciplinar',
    'Processo Administrativo Sancionador (PAS)': 'Sancionatória', 'Recurso Administrativo': 'Recursal', 'Requerimento': 'Requerimento', 'Requerimento de certidão': 'Requerimento',
    'Petição eletrônica': 'Requerimento', 'Comunicação interna': 'Comunicação', 'Comunicação externa': 'Comunicação', 'Manifestação': 'Recursal', 'Denúncia (Ouvidoria)': 'Ouvidoria',
    'Auto de Infração': 'Fiscalizatória', 'Tomada de Contas': 'Controle externo', 'Tomada de Contas Especial': 'Controle externo', 'Processo de Pagamento (contrato)': 'Contratual',
    'Acompanhamento de Execução Contratual': 'Contratual', 'Sanção Contratual': 'Contratual', 'Convênio / Ajuste': 'Contratual', 'Processo Administrativo': 'Outra', 'Judicial': 'Judicial', 'Outro': 'Outra' }

const OBJETOS = {
    'Processo Administrativo Disciplinar (PAD)': ['Apuração de suposta irregularidade em vistorias veiculares realizadas pela credenciada', 'Apuração de descumprimento das normas de credenciamento (Portaria DETRAN/RO)', 'Suposta emissão de laudo de vistoria sem inspeção presencial do veículo'],
    'Processo Administrativo Preliminar': ['Verificação de denúncia sobre vistoria realizada fora do horário autorizado', 'Apuração preliminar de divergência entre laudo e fotos do veículo', 'Análise de reclamação de usuário sobre cobrança indevida'],
    'Recurso Administrativo': ['Pedido de reconsideração e reexame da penalidade de suspensão, com efeito suspensivo', 'Recurso contra a decisão que aplicou multa e advertência', 'Recurso contra o indeferimento da renovação do credenciamento'],
    'Requerimento de certidão': ['Certidão de inteiro teor dos autos para instruir defesa', 'Certidão negativa de penalidades para renovação de credenciamento'],
    'Comunicação interna': ['Encaminhamento dos autos à corregedoria para análise', 'Solicitação de informações ao setor de fiscalização', 'Remessa à procuradoria para parecer jurídico'],
    'Comunicação externa': ['Notificação da empresa para apresentar documentos complementares', 'Ofício ao órgão solicitando cópia integral do processo'],
    'Manifestação': ['Manifestação sobre o relatório final da comissão processante', 'Alegações finais após a instrução', 'Manifestação sobre documentos juntados pelo órgão'],
    'Auto de Infração': ['Defesa prévia ao auto de infração por irregularidade documental', 'Impugnação do auto de infração por vício de notificação'],
    'Requerimento': ['Pedido de vista e cópia integral dos autos', 'Pedido de habilitação dos advogados nos autos', 'Pedido de prorrogação de prazo para defesa'],
}
const objetoGenerico = ['Acompanhamento processual e defesa dos interesses do cliente', 'Pedido de regularização da situação administrativa do cliente']

function situacao(p, d1, d2) {
    const org = p.orgaoSigla ?? 'órgão'
    const t = p.tipo ?? ''
    // Status encerrado (vindo da planilha ou sorteado) não pode ganhar texto de processo em andamento.
    if (p.status === 'Arquivado') return escolher([
        `Processo arquivado pelo ${org} em ${br(d1)}, sem aplicação de penalidade. Nenhuma providência pendente para o escritório; cópia da decisão na pasta do cliente.`,
        `Arquivamento determinado em ${br(d1)} após acolhimento da manifestação da defesa. Autos mantidos para consulta.`])
    if (p.status === 'Concluído') return escolher([
        `Processo concluído em ${br(d1)} com decisão favorável ao cliente. Decisão publicada e arquivada na pasta do cliente.`,
        `Concluído em ${br(d1)}: pedido atendido pelo ${org}. Sem providências pendentes.`])
    if (t.includes('PAD')) return escolher([
        `Defesa escrita apresentada em ${br(d1)}. A comissão processante do ${org} designou audiência de instrução para ${br(d2)}, com oitiva das testemunhas arroladas pela defesa.`,
        `Instaurado o PAD, a empresa foi citada e apresentou defesa em ${br(d1)}, arguindo nulidade da portaria de instauração. Aguardando relatório final da comissão.`,
        `Relatório final da comissão entregue em ${br(d1)}, sugerindo advertência. O escritório apresentou alegações finais; aguardando decisão da autoridade julgadora do ${org}.`])
    if (t.includes('Preliminar') || t.includes('Sindicância')) return escolher([
        `Investigação preliminar em curso no ${org}. Manifestação prévia protocolada em ${br(d1)}, com documentos que afastam a irregularidade apontada. Aguardando decisão sobre arquivamento ou instauração de PAD.`,
        `O ${org} solicitou esclarecimentos em ${br(d1)}; resposta enviada no prazo, com cópia dos laudos e registros fotográficos. Aguardando parecer da corregedoria.`])
    if (t.includes('Recurso') || t.includes('Manifestação')) return escolher([
        `Recurso protocolado em ${br(d1)} contra a decisão de primeira instância, com pedido de efeito suspensivo. Aguardando juízo de admissibilidade da autoridade superior do ${org}.`,
        `Peça protocolada em ${br(d1)} por peticionamento intercorrente e encaminhada à assessoria jurídica do ${org}. Parecer esperado até ${br(d2)}.`])
    if (t.includes('certidão') || t.includes('Requerimento') || t.includes('Petição')) return escolher([
        `Pedido protocolado em ${br(d1)}. O ${org} informou prazo de 15 dias úteis para resposta; acompanhar até ${br(d2)}.`,
        `Requerimento deferido em ${br(d1)}; documento disponibilizado no sistema. Cópia arquivada na pasta do cliente.`])
    if (t.includes('Comunicação')) return escolher([
        `Comunicação encaminhada em ${br(d1)} ao setor responsável do ${org}. Aguardando retorno para dar andamento ao processo principal.`,
        `Resposta recebida em ${br(d1)}; informações juntadas ao processo principal e repassadas ao cliente.`])
    if (t.includes('Auto de Infração')) return `Defesa ao auto de infração apresentada em ${br(d1)}. Aguardando julgamento em primeira instância no ${org}.`
    return `Processo em acompanhamento no ${org}. Última providência do escritório em ${br(d1)}; aguardando manifestação do órgão, com nova conferência prevista para ${br(d2)}.`
}

function movimentacao(p, d) {
    const t = p.tipo ?? ''
    const hora = `${p2(entre(8, 17))}:${p2(entre(0, 59))}`
    const desc = t.includes('PAD') ? escolher(['Juntada da defesa escrita', 'Designação de audiência de instrução', 'Relatório final da comissão juntado aos autos'])
        : t.includes('Recurso') ? escolher(['Recurso recebido e encaminhado à autoridade superior', 'Juízo de admissibilidade pendente', 'Remessa à assessoria jurídica'])
        : t.includes('Comunicação') ? escolher(['Comunicação enviada ao setor responsável', 'Resposta da unidade juntada aos autos'])
        : t.includes('certidão') || t.includes('Requerimento') ? escolher(['Requerimento recebido pela unidade', 'Documento disponibilizado ao interessado'])
        : escolher(['Processo recebido na unidade para análise', 'Despacho de encaminhamento', 'Juntada de documentos'])
    return { dataHora: `${d}T${hora}`, descricao: `${desc}.` }
}

const STATUS = ['Em andamento', 'Em andamento', 'Em análise', 'Em análise', 'Aguardando prazo', 'Aguardando documentos', 'Suspenso', 'Concluído']
const LINK_SEI = 'https://sei.sistemas.ro.gov.br/'

/** Completa os campos vazios de um processo (não sobrescreve o que veio da planilha). */
function completar(p) {
    p.sistema ??= 'SEI/RO'
    p.tipo ??= escolher(['Processo Administrativo Preliminar', 'Processo Administrativo Disciplinar (PAD)', 'Requerimento', 'Processo Administrativo Disciplinar (PAD)'])
    p.natureza ??= NATUREZA[p.tipo] ?? 'Outra'
    p.objeto ??= escolher(OBJETOS[p.tipo] ?? objetoGenerico)
    if (!p.orgaoSigla) p.orgaoSigla = 'DETRAN/RO'
    p.orgaoNome ??= NOME_DO_ORGAO[p.orgaoSigla]
    p.status ??= escolher(STATUS)
    const d1 = dataEntre('2025-11-01', '2026-08-20')
    const d2 = dataEntre('2026-08-21', '2026-10-30')
    p.situacaoAtual ??= situacao(p, d1, d2)
    p.ultimaMovimentacao ??= movimentacao(p, dataEntre(d1, HOJE))
    p.linkProcesso ??= LINK_SEI
    p.acesso ??= {}
    if (!p.acesso.termino) p.acesso.termino = rnd() < 0.25 ? dataEntre('2025-10-01', '2026-09-01') : dataEntre('2026-09-15', '2027-12-31')
    p.acesso.forma ??= escolher(['SEI GERAL', 'Login SEI', 'E-mail atendimento'])
    p.acesso.situacao ??= p.acesso.termino < HOJE ? 'EXPIRADO' : 'ATIVO'
    return p
}

// ── 1. completa o que existe ───────────────────────────────────────────────────────────────
const antes = base.processos.length
for (const p of base.processos) completar(p)

// ── 2. novos desdobramentos e novos principais ────────────────────────────────────────────
const numerosUsados = new Set(base.processos.map(p => normalizar(p.numero)))
const idsUsados = new Set(base.processos.map(p => p.id))
function novoNumero(referencia) {
    const prefixo = /^\d{4}/.test(referencia) ? referencia.slice(0, 4) : '0010'
    for (;;) {
        const ano = escolher(['2025', '2026', '2026'])
        const n = `${prefixo}.${dig(6)}/${ano}-${dig(2)}`
        if (!numerosUsados.has(normalizar(n)) && !idsUsados.has(idProcesso(n))) { numerosUsados.add(normalizar(n)); idsUsados.add(idProcesso(n)); return n }
    }
}
function novoProcesso(modelo, extras) {
    const p = { id: '', clienteId: modelo.clienteId, numero: novoNumero(modelo.numero), sistema: modelo.sistema ?? 'SEI/RO', orgaoSigla: modelo.orgaoSigla, orgaoNome: modelo.orgaoNome, ...extras }
    p.id = idProcesso(p.numero)
    p.acesso = { forma: modelo.acesso?.forma, conta: modelo.acesso?.conta }
    return completar(p)
}

const filhosDe = new Map()
for (const p of base.processos) if (p.processoPaiId) filhosDe.set(p.processoPaiId, (filhosDe.get(p.processoPaiId) ?? 0) + 1)

const saida = []
let novosDesdobramentos = 0, novosPrincipais = 0
const DESDOBRAMENTOS = [
    { tipo: 'Recurso Administrativo', vinculo: 'derivado' },
    { tipo: 'Comunicação interna', vinculo: 'relacionado' },
    { tipo: 'Manifestação', vinculo: 'derivado' },
    { tipo: 'Requerimento de certidão', vinculo: 'relacionado' },
    { tipo: 'Comunicação externa', vinculo: 'derivado' },
]
// Um cliente por vez, na ordem da planilha: os filhos entram logo depois do processo de origem.
// A marca na origem evita criar processos de novo se o script rodar duas vezes (os campos vazios continuam sendo completados).
const jaGerado = String(base.origem ?? '').includes('enriquecida')
for (const p of base.processos) {
    saida.push(p)
    if (jaGerado || p.processoPaiId || filhosDe.get(p.id)) continue
    if (rnd() >= 0.45) continue
    const quantos = entre(1, 3)
    const tipos = [...DESDOBRAMENTOS].sort(() => rnd() - 0.5).slice(0, quantos)
    for (const d of tipos) {
        const filho = novoProcesso(p, { tipo: d.tipo, processoPaiId: p.id, vinculo: d.vinculo })
        saida.push(filho)
        novosDesdobramentos++
        if (d.tipo === 'Recurso Administrativo' && rnd() < 0.4) {
            saida.push(novoProcesso(filho, { tipo: 'Comunicação externa', processoPaiId: filho.id, vinculo: 'derivado' }))
            novosDesdobramentos++
        }
    }
}
// Segundo processo principal, em outro órgão, para parte dos clientes que só tinham um.
const porCliente = new Map()
for (const p of saida) porCliente.set(p.clienteId, (porCliente.get(p.clienteId) ?? 0) + 1)
const OUTROS_ORGAOS = ['SEFIN/RO', 'SEDUC', 'SESAU', 'SEGEP', 'DER', 'SEDAM', 'PGE']
if (!jaGerado) for (const c of base.clientes) {
    if (porCliente.get(c.id) !== 1 || rnd() >= 0.5) continue
    const referencia = saida.find(p => p.clienteId === c.id)
    const orgao = escolher(OUTROS_ORGAOS)
    const principal = novoProcesso({ ...referencia, orgaoSigla: orgao, orgaoNome: NOME_DO_ORGAO[orgao], numero: '0031' }, {
        tipo: c.tipoPessoa === 'PF' ? escolher(['Requerimento', 'Processo Administrativo Disciplinar (PAD)', 'Sindicância']) : escolher(['Auto de Infração', 'Sanção Contratual', 'Processo de Pagamento (contrato)']),
        orgaoSigla: orgao, orgaoNome: NOME_DO_ORGAO[orgao],
    })
    const i = saida.findLastIndex(p => p.clienteId === c.id)
    saida.splice(i + 1, 0, principal)
    novosPrincipais++
    if (rnd() < 0.6) {
        saida.splice(i + 2, 0, novoProcesso(principal, { tipo: escolher(['Recurso Administrativo', 'Manifestação']), processoPaiId: principal.id, vinculo: 'derivado' }))
        novosDesdobramentos++
    }
}

saida.forEach((p, i) => { p.ordem = i })
base.processos = saida
if (!String(base.origem ?? '').includes('enriquecida')) base.origem = `${base.origem ?? 'base.json'} (demo enriquecida)`
writeFileSync(arquivo, JSON.stringify(base, null, 2) + '\n')

const cheios = campo => base.processos.filter(p => p[campo]).length
console.log(`✔ ${process.argv[2] ?? 'dados/base.json'}: ${antes} → ${base.processos.length} processos (+${novosDesdobramentos} desdobramentos, +${novosPrincipais} principais)`)
console.log(`  preenchidos: situação atual ${cheios('situacaoAtual')}, última movimentação ${cheios('ultimaMovimentacao')}, objeto ${cheios('objeto')}, status ${cheios('status')}, link ${cheios('linkProcesso')} de ${base.processos.length}`)
if (jaGerado) console.log('  (a base já tinha sido enriquecida: só completei campos vazios, sem criar processos novos)')
