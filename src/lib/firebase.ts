import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { FIREBASE_CONFIG } from './firebaseConfig.mjs'

// Projeto próprio do PAPA (`papa-85025`, ver firebaseConfig.mjs): login e banco separados do Nexus e do Financeiro.
// O Firestore fica em repositorioFirestore.ts, carregado sob demanda: a demo (sem login, JSON estático) não leva esse código.
export const app = initializeApp(FIREBASE_CONFIG)

export const auth = getAuth(app)
