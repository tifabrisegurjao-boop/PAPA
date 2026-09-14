import { FirebaseError } from 'firebase/app'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './firebase.ts'

// Tudo que fala com o Firebase Auth fica aqui, carregado por import() só quando há login de verdade:
// a demo (VITE_DEMO) e o `?semLogin` do dev não levam nem inicializam o Firebase.

const MENSAGENS: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com o servidor de login.',
    'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication › Authorized domains).',
}

export interface Sessao {
    email: string | null
}

/** Avisa quem está conectado (null = ninguém). Retorna a função que cancela. */
export function observar(aoMudar: (sessao: Sessao | null) => void): () => void {
    return onAuthStateChanged(auth, u => aoMudar(u ? { email: u.email } : null))
}

/** Entra com e-mail e senha; lança Error com mensagem em português. */
export async function entrar(email: string, senha: string): Promise<void> {
    try {
        await signInWithEmailAndPassword(auth, email.trim(), senha)
    } catch (err) {
        throw new Error(err instanceof FirebaseError ? (MENSAGENS[err.code] ?? `Falha no login (${err.code}).`) : 'Falha no login.')
    }
}

export const sair = () => signOut(auth)
