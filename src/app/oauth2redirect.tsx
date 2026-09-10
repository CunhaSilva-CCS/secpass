import { Redirect } from 'expo-router';

// Rota "fantasma": existe so pra o Expo Router nao mostrar a tela de "rota
// nao encontrada" quando o retorno do OAuth do Google no Android chega como
// deep link (ver ANDROID_REDIRECT_URI em src/services/driveAuth.js). O
// codigo em si e capturado por WebBrowser.openAuthSessionAsync via
// Linking.addEventListener antes desta rota renderizar de fato - esta tela
// so cobre a fracao de segundo entre o Router tambem receber o mesmo evento
// de deep link e navegar, ate ele ser mandado de volta pro app.
export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
