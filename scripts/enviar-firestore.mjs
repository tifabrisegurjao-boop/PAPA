// npm run dados:firestore -- [base.json] [--forcar]
// Envia a base (gerada da planilha por `npm run dados`) para o Firestore do projeto pagamento-255fc — o banco
// que o painel lê e edita. Roda com o SDK web do Firebase e o login de um usuário do escritório (pede e-mail e
// senha no terminal; a senha não fica em lugar nenhum).
//
// Regras de segurança da importação (o painel é o cofre; a planilha entra por aqui):
//   - casa cada linha pelo id (slug do nº / do nome) e, se não achar, pelo nº do processo / nome do cliente já
//     gravados (quem corrigiu um número no painel não ganha uma cópia);
//   - registro EDITADO NO PAINEL (atualizadoPor sem o prefixo "importação:") não é sobrescrito — é pulado com aviso,
//     salvo com --forcar; nesse caso o estado anterior vai para historico/;
//   - nunca apaga nada: linha que sumiu da planilha continua no banco.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Writable } from 'node:stream'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDocs, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore'

const args = process.argv.slice(2)
const forcar = args.includes('--forcar')
const arquivo = args.find(a => !a.startsWith('--')) ?? 'dados/base.json'
const base = JSON.parse(readFileSync(arquivo, 'utf8'))

const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,\-/_]+/g, ' ').replace(/\s+/g, ' ').trim()
const soDigitos = t => String(t ?? '').replace(/\D/g, '')
const chaveNumero = n => (soDigitos(n).length >= 4 ? soDigitos(n) : normalizar(n))

const app = initializeApp({
    apiKey: 'AIzaSyB-RBsirfY1v0Db9BtzKhix37mObE0mfyw',
    authDomain: 'pagamento-255fc.firebaseapp.com',
    projectId: 'pagamento-255fc',
})
const auth = getAuth(app)
const db = getFirestore(app)

const rl = createInterface({ input: stdin, output: stdout })
const email = (await rl.question('E-mail (usuário do Nexus): ')).trim()
rl.close() // fecha ANTES da senha: duas interfaces no mesmo stdin ecoariam o que for digitado
// Senha sem eco: a interface escreve num stream mudo enquanto lê.
const mudo = new Writable({ write(_c, _e, cb) { cb() } })
const rlSenha = createInterface({ input: stdin, output: mudo, terminal: true })
stdout.write('Senha: ')
const senha = await rlSenha.question('')
stdout.write('\n')
rlSenha.close()

const credencial = await signInWithEmailAndPassword(auth, email, senha)
const quem = `importação:${credencial.user.email}`
console.log(`Conectado como ${credencial.user.email}. Lendo o que já existe no banco…`)

const existentes = async colecao => {
    const snap = await getDocs(collection(db, colecao))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
const clientesNoBanco = await existentes('papaClientes')
const processosNoBanco = await existentes('papaProcessos')
const porChave = (lista, chave) => new Map(lista.map(x => [chave(x), x]))
const clientePorNome = porChave(clientesNoBanco, c => normalizar(c.nome))
const processoPorNumero = porChave(processosNoBanco, p => chaveNumero(p.numero))
const clientePorId = new Map(clientesNoBanco.map(c => [c.id, c]))
const processoPorId = new Map(processosNoBanco.map(p => [p.id, p]))
console.log(`  ${clientesNoBanco.length} clientes e ${processosNoBanco.length} processos já no banco. Enviando ${base.clientes.length} clientes e ${base.processos.length} processos da planilha…`)

// Lotes de até 500 escritas (limite do Firestore).
let lote = writeBatch(db), noLote = 0
const resumo = { novos: 0, atualizados: 0, pulados: 0, forcados: 0 }
const pulados = []
const commit = async () => { if (noLote) { await lote.commit(); lote = writeBatch(db); noLote = 0 } }
const escrever = async (colecao, id, dados, anterior) => {
    if (anterior) lote.set(doc(collection(doc(db, colecao, id), 'historico')), { ...anterior, id: undefined, arquivadoEm: serverTimestamp(), arquivadoPor: quem })
    lote.set(doc(db, colecao, id), { ...JSON.parse(JSON.stringify(dados)), versao: (anterior?.versao ?? 0) + 1, atualizadoEm: serverTimestamp(), atualizadoPor: quem })
    noLote += anterior ? 2 : 1
    if (noLote >= 440) await commit()
}
const gravar = async (colecao, registro, achar) => {
    const { id, ...dados } = registro
    const existente = achar(registro)
    if (!existente) { await escrever(colecao, id, dados); resumo.novos++; return }
    const editadoNoPainel = existente.atualizadoPor && !String(existente.atualizadoPor).startsWith('importação:')
    if (editadoNoPainel && !forcar) { resumo.pulados++; pulados.push(`${colecao}/${existente.id} (${existente.atualizadoPor})`); return }
    // O id do banco prevalece (quem corrigiu um nº no painel não ganha cópia); campos da planilha sobrescrevem os do banco.
    const { id: _i, atualizadoEm: _a, atualizadoPor: _p, versao: _v, ...anteriorSemMeta } = existente
    await escrever(colecao, existente.id, { ...anteriorSemMeta, ...dados }, existente)
    if (editadoNoPainel) resumo.forcados++
    else resumo.atualizados++
}
for (const c of base.clientes) await gravar('papaClientes', c, x => clientePorId.get(x.id) ?? clientePorNome.get(normalizar(x.nome)))
for (const p of base.processos) {
    // Processo cujo cliente já existia com outro id (nome corrigido no painel) aponta para o id do banco.
    const dono = clientePorId.get(p.clienteId) ?? clientePorNome.get(normalizar(base.clientes.find(c => c.id === p.clienteId)?.nome ?? ''))
    await gravar('papaProcessos', dono ? { ...p, clienteId: dono.id } : p, x => processoPorId.get(x.id) ?? processoPorNumero.get(chaveNumero(x.numero)))
}
await commit()
console.log(`✔ novos: ${resumo.novos} · atualizados: ${resumo.atualizados} · sobrescritos com --forcar: ${resumo.forcados} · pulados (editados no painel): ${resumo.pulados}`)
if (pulados.length) console.log('  Pulados (use --forcar para sobrescrever; o estado anterior vai para historico/):\n   ' + pulados.join('\n   '))
if (base.avisos?.length) console.log(`  ${base.avisos.length} avisos da planilha continuam valendo (veja o JSON).`)
process.exit(0)
