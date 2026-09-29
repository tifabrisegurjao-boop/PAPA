// npm run dados:firestore -- caminho/do/arquivo.json [--forcar]
// Envia a base gerada da planilha REAL (`npm run dados -- planilha.xlsx` → dados/real/base.json) para o Firestore do projeto
// próprio do PAPA (src/lib/firebaseConfig.mjs) — o banco que o painel lê e edita. Usa o SDK web do Firebase e o login de
// alguém da equipe (pede e-mail e senha no terminal; a senha não fica em lugar nenhum).
//
// O que este script garante (as regras em si estão em scripts/lib/importacao.mjs, testadas):
//   - recusa base de demonstração (dados/base.json é fictícia e não tem como ser apagada pelo sistema depois);
//   - mostra o plano (novos / atualizados / inalterados / pulados / avisos) e só grava depois de você digitar SIM;
//   - confere cada documento contra os limites das regras ANTES de gravar: um campo grande demais é apontado pelo id e
//     pelo campo, em vez de derrubar um lote inteiro com "Missing or insufficient permissions";
//   - registro editado pela tela não é sobrescrito (só com --forcar; o anterior vai para historico/); nada é apagado.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore'
import { IMPORTACAO, conferirBase, paraHistorico, planejarImportacao, validarRegistro } from './lib/importacao.mjs'
import { FIREBASE_CONFIG, PROJETO } from '../src/lib/firebaseConfig.mjs'

const args = process.argv.slice(2)
const forcar = args.includes('--forcar')
const arquivo = args.find(a => !a.startsWith('--'))
const sair = (mensagem, codigo = 1) => { console.error(`\n✖ ${mensagem}`); process.exit(codigo) }

if (!arquivo) sair('Uso: npm run dados:firestore -- caminho/do/arquivo.json [--forcar]\n' +
    '  O arquivo é o JSON gerado por `npm run dados` a partir da planilha REAL (por padrão dados/real/base.json).\n' +
    '  dados/base.json é a base FICTÍCIA da demonstração e não vai para o banco.')
if (!stdin.isTTY) sair('Rode num terminal interativo (PowerShell ou Prompt de Comando): o script pede e-mail e senha.')

let base
try { base = JSON.parse(readFileSync(arquivo, 'utf8')) } catch (e) { sair(`Não consegui ler ${arquivo}: ${e.message}`) }
const problemas = conferirBase(base)
if (problemas.length) sair(`${arquivo} não pode ir para o banco real:\n  - ${problemas.join('\n  - ')}`)

console.log(`Arquivo: ${arquivo}`)
console.log(`  origem: ${base.origem ?? '?'} · gerado em ${String(base.geradoEm ?? '?').replace('T', ' ')} · ${base.clientes.length} clientes · ${base.processos.length} processos` +
    (base.avisos?.length ? ` · ${base.avisos.length} avisos do conversor (veja o JSON)` : ''))
console.log('  Enquanto a importação roda, ninguém deve salvar pela tela: o que for salvo nesse intervalo pode ser sobrescrito.\n')

// ── login ──
const cancelar = () => sair('Cancelado. Nada foi gravado.', 0)
// Ctrl+C numa pergunta: em modo terminal o readline recebe a tecla (não o SIGINT do processo) e rejeita a promessa com AbortError.
const perguntarEm = async (rl, pergunta) => {
    rl.on('SIGINT', cancelar)
    try { return (await rl.question(pergunta)).trim() } catch (e) { if (e?.name === 'AbortError') cancelar(); throw e } finally { rl.close() }
}
const perguntar = pergunta => perguntarEm(createInterface({ input: stdin, output: stdout }), pergunta)
const email = await perguntar(`E-mail (conta do PAPA no projeto ${PROJETO}): `)
// Senha sem eco: a interface escreve num stream mudo enquanto lê (a interface anterior já foi fechada — duas no mesmo stdin ecoariam).
const mudo = new Writable({ write(_c, _e, cb) { cb() } })
stdout.write('Senha: ')
const senha = await perguntarEm(createInterface({ input: stdin, output: mudo, terminal: true }), '')
stdout.write('\n')

const app = initializeApp(FIREBASE_CONFIG)
const auth = getAuth(app)
const db = getFirestore(app)

const MENSAGENS_LOGIN = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/missing-password': 'Senha vazia.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Esta conta está desativada no Firebase.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o servidor de login.',
}
let credencial
try { credencial = await signInWithEmailAndPassword(auth, email, senha) } catch (e) { sair(MENSAGENS_LOGIN[e.code] ?? `Falha no login (${e.code ?? e.message}).`) }
const usuario = credencial.user.email
const quem = `${IMPORTACAO}${usuario}`

const semPermissao = `O banco recusou ${usuario}. Confira, nesta ordem: (1) existe o documento papaEquipe/${usuario.toLowerCase()} no Firestore ` +
    '(o id é o e-mail, todo em minúsculas); (2) as regras deste projeto foram publicadas (`npm run regras`, a partir desta pasta).'
try {
    const equipe = await getDoc(doc(db, 'papaEquipe', usuario.toLowerCase()))
    if (!equipe.exists()) sair(semPermissao)
} catch (e) {
    sair(e.code === 'permission-denied' ? semPermissao : `Falha ao consultar o banco: ${e.message}`)
}
console.log(`Conectado como ${usuario}. Lendo o que já existe no banco…`)

const existentes = async colecao => {
    const snap = await getDocs(collection(db, colecao))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
let clientesNoBanco, processosNoBanco
try {
    clientesNoBanco = await existentes('papaClientes')
    processosNoBanco = await existentes('papaProcessos')
} catch (e) {
    sair(e.code === 'permission-denied' ? semPermissao : `Falha ao ler o banco: ${e.message}`)
}
console.log(`  ${clientesNoBanco.length} clientes e ${processosNoBanco.length} processos já no banco.\n`)

// ── plano ──
const plano = planejarImportacao(base, { clientesNoBanco, processosNoBanco, forcar })
const invalidos = plano.escritas.flatMap(e => validarRegistro(e.colecao, e.dados).map(erro => `${e.colecao}/${e.id}: ${erro}`))
if (invalidos.length)
    sair(`${invalidos.length} documento(s) seriam recusados pelas regras do banco — nada foi gravado. Corrija na planilha e gere o JSON de novo:\n  - ${invalidos.join('\n  - ')}`)

const r = plano.resumo
console.log(`Plano: ${r.novos} novos · ${r.atualizados} atualizados · ${r.reordenados} só mudaram de posição · ${r.inalterados} inalterados (não serão regravados) · ${r.forcados} sobrescritos com --forcar · ${r.pulados} pulados (editados pela tela) · ${r.excluidos} na lixeira (não reimportados)`)
if (plano.pulados.length) console.log(`  Pulados (use --forcar para sobrescrever; o estado anterior vai para historico/):\n   ${plano.pulados.map(p => `${p.colecao}/${p.id} (${p.atualizadoPor})`).join('\n   ')}`)
if (plano.naLixeira.length) console.log(`  Na lixeira (excluídos pela tela; nem --forcar os traz de volta — restaure pela tela ou tire a linha da planilha):\n   ${plano.naLixeira.map(p => `${p.colecao}/${p.id} (${p.excluidoPor ?? '?'})`).join('\n   ')}`)
if (plano.avisos.length) console.log(`  Avisos:\n   ⚠ ${plano.avisos.join('\n   ⚠ ')}`)
if (!plano.escritas.length) { console.log('\nNada a gravar: o banco já está igual à planilha.'); process.exit(0) }

const confirmacao = await perguntar(`\nGravar ${plano.escritas.length} documento(s) em ${PROJETO} como ${quem}? Digite SIM para continuar: `)
if (confirmacao !== 'SIM') sair('Cancelado. Nada foi gravado.', 0)

// ── gravação em lotes de até 500 escritas (limite do Firestore); cada lote é tudo-ou-nada ──
let lote = writeBatch(db), noLote = 0, idsDoLote = []
let gravados = 0
const commit = async () => {
    if (!noLote) return
    try {
        await lote.commit()
    } catch (e) {
        sair(`O banco recusou um lote com ${idsDoLote.length} documento(s) (${e.code ?? e.message}). Já haviam sido gravados ${gravados} documentos; os deste lote não:\n   ${idsDoLote.join('\n   ')}\n` +
            (e.code === 'permission-denied' ? '  permission-denied depois da validação local costuma ser papaEquipe/regras (veja acima) ou regra publicada diferente de firestore.rules.' : ''))
    }
    gravados += idsDoLote.length
    lote = writeBatch(db); noLote = 0; idsDoLote = []
}
for (const e of plano.escritas) {
    const ref = doc(db, e.colecao, e.id)
    if (e.anterior && e.motivo !== 'ordem') { // só a posição mudou: não vale uma cópia no historico
        lote.set(doc(collection(ref, 'historico')), { ...paraHistorico(e.anterior), arquivadoEm: serverTimestamp(), arquivadoPor: quem })
        noLote++
    }
    lote.set(ref, { ...e.dados, versao: (e.anterior?.versao ?? 0) + 1, atualizadoEm: serverTimestamp(), atualizadoPor: quem })
    noLote++
    idsDoLote.push(`${e.colecao}/${e.id}`)
    if (noLote >= 440) await commit()
}
await commit()
console.log(`\n✔ ${gravados} documento(s) gravados: ${r.novos} novos · ${r.atualizados} atualizados · ${r.reordenados} reposicionados · ${r.forcados} sobrescritos com --forcar. ${r.pulados} pulados, ${r.inalterados} já estavam iguais.`)
process.exit(0)
