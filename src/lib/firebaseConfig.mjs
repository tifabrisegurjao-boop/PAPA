// Projeto Firebase PRÓPRIO do PAPA (`papa-85025`, decisão de 29/09/2026): banco e login só dele, separados do
// Nexus (`pagamento-255fc`) e do Financeiro (`pagamento-5b5c1`). Assim publicar regras ou carregar a planilha
// nunca mexe nos outros sistemas, e a cota gratuita diária é só do PAPA.
// Fonte única da configuração: o site (src/lib/firebase.ts) e o importador (scripts/enviar-firestore.mjs) leem daqui.
// A apiKey é pública por natureza (vai no bundle do site); quem protege os dados são as regras (firestore.rules + papaEquipe).
// É .mjs para o script de importação rodar em qualquer Node sem transpilar; firebaseConfig.d.mts dá os tipos.

export const PROJETO = 'papa-85025'

export const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyB-u0x6_pETyaYR4VKS6jxeE3aR4zpAOWc',
    authDomain: 'papa-85025.firebaseapp.com',
    projectId: PROJETO,
    storageBucket: 'papa-85025.firebasestorage.app',
    messagingSenderId: '97168660466',
    appId: '1:97168660466:web:0d6ab161d0e16802b8bd6b',
}
