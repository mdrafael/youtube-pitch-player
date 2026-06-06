# Configuração do Render (passo a passo)

Você já conectou o Git. Agora crie o **Web Service**:

## 1. Criar o serviço

1. No Render: **Dashboard → New + → Web Service**
2. Selecione o repositório **`mdrafael/youtube-pitch-player`**
3. Preencha:

| Campo | Valor |
|-------|-------|
| **Name** | `youtube-pitch-player` |
| **Region** | Oregon (US West) ou o mais próximo |
| **Branch** | `master` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Plan** | Free |

## 2. Variáveis de ambiente

Em **Environment → Add Environment Variable**:

| Key | Value |
|-----|-------|
| `ALLOWED_ORIGINS` | `https://youtube-pitch-player.vercel.app` |
| `NODE_VERSION` | `20` |

### (Opcional) Se aparecer bloqueio do YouTube

Alguns vídeos falham em servidores cloud. Você pode adicionar cookies exportados do seu navegador:

| Key | Value |
|-----|-------|
| `YOUTUBE_COOKIES` | Conteúdo do arquivo `cookies.txt` (formato Netscape) exportado com extensão "Get cookies.txt LOCALLY" no Chrome |

## 3. Deploy

Clique em **Create Web Service** e aguarde o build (5–10 min na primeira vez).

Quando ficar **Live**, copie a URL no topo, exemplo:

```
https://youtube-pitch-player.onrender.com
```

## 4. Conectar na Vercel

No painel da Vercel → projeto **youtube-pitch-player** → **Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://youtube-pitch-player.onrender.com` |

(sua URL do Render, **sem barra no final**)

Depois: **Deployments → Redeploy** (ou rode `npx vercel --prod`).

## 5. Testar

1. Abra https://youtube-pitch-player.vercel.app
2. Cole um link do YouTube
3. Clique em **Carregar vídeo**

> No plano gratuito, o Render “dorme” após 15 min sem uso. A primeira requisição pode demorar ~30s.
