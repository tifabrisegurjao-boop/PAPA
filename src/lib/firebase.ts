import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Mesmo projeto do Nexus (`pagamento-255fc`): quem já entra no Nexus entra aqui com o mesmo e-mail e senha,
// e o banco do PAPA são coleções próprias (papaClientes / papaProcessos) dentro desse projeto.
// O Firestore fica em repositorioFirestore.ts, carregado sob demanda: a demo (sem login, JSON estático) não leva esse código.
export const app = initializeApp({
    apiKey: 'AIzaSyB-RBsirfY1v0Db9BtzKhix37mObE0mfyw',
    authDomain: 'pagamento-255fc.firebaseapp.com',
    projectId: 'pagamento-255fc',
    storageBucket: 'pagamento-255fc.firebasestorage.app',
    messagingSenderId: '1016688930778',
    appId: '1:1016688930778:web:6df6ee1c6c5cddc2c6dae3',
})

export const auth = getAuth(app)
