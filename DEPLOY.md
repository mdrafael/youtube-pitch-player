# Deploy — Vercel + Render

Este projeto tem **duas partes**:

| Parte | O que é | Onde hospedar |
|-------|---------|---------------|
| **Frontend** | Interface (HTML/JS/CSS) | **Vercel** |
| **Backend** | Processamento de áudio (`server.js`) | **Render** (grátis) |

A Vercel **não suporta** o servidor de áudio (processos longos, binários, armazenamento). Por isso o frontend vai na Vercel e a API em outro serviço.

---

## Passo 1 — Subir o código no GitHub

```bash
cd youtube-pitch-player
git init
git add .
git commit -m "YouTube Pitch Player"
git remote add origin https://github.com/SEU_USUARIO/youtube-pitch-player.git
git push -u origin main
```

---

## Passo 2 — Backend no Render (grátis)

1. Acesse [render.com](https://render.com) e crie uma conta
2. **New → Web Service**
3. Conecte o repositório GitHub
4. Configuração:
   - **Name:** `youtube-pitch-api`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Em **Environment Variables**, adicione:
   - `ALLOWED_ORIGINS` = `https://SEU-APP.vercel.app` (você atualiza depois do passo 3)
6. Clique em **Create Web Service**
7. Copie a URL gerada, ex: `https://youtube-pitch-api.onrender.com`

> No plano gratuito do Render, o servidor “dorme” após inatividade. A primeira requisição pode demorar ~30s.

---

## Passo 3 — Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e crie uma conta
2. **Add New → Project**
3. Importe o repositório do GitHub
4. Configuração (detecta Vite automaticamente):
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Em **Environment Variables**, adicione:
   - `VITE_API_URL` = `https://youtube-pitch-api.onrender.com` (URL do Render, **sem barra no final**)
6. Clique em **Deploy**
7. Copie a URL da Vercel, ex: `https://youtube-pitch-player.vercel.app`

---

## Passo 4 — Conectar frontend e backend

Volte ao **Render** e atualize a variável:

```
ALLOWED_ORIGINS=https://youtube-pitch-player.vercel.app
```

Salve e aguarde o redeploy.

---

## Passo 5 — Testar

1. Abra a URL da Vercel
2. Cole um link do YouTube
3. Clique em **Carregar vídeo**
4. Aguarde o processamento e teste o pitch

---

## Deploy só pela CLI (Vercel)

```bash
npm i -g vercel
cd youtube-pitch-player
vercel
```

Na primeira vez, siga o assistente. Depois configure `VITE_API_URL` no painel da Vercel.

Para produção:

```bash
vercel --prod
```

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| "Serviço de áudio indisponível" | Verifique `VITE_API_URL` na Vercel |
| Erro de CORS | Adicione a URL da Vercel em `ALLOWED_ORIGINS` no Render |
| Demora na primeira carga | Render free tier acorda lentamente |
| OneDrive bloqueia npm | Mova o projeto para `C:\projetos\` |
