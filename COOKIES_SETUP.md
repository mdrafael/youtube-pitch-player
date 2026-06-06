# Como configurar cookies no Render (obrigatório para produção)

O YouTube bloqueia servidores na nuvem (Render, Vercel, etc.). A solução é adicionar cookies da sua sessão do YouTube.

## Passo 1 — Instalar extensão no Chrome

Instale: **"Get cookies.txt LOCALLY"**  
https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc

## Passo 2 — Exportar cookies

1. Abra **https://www.youtube.com** no Chrome (logado na sua conta)
2. Clique na extensão → **Export** (formato Netscape)
3. Salve o arquivo `cookies.txt`

## Passo 3 — Adicionar no Render

1. Acesse https://dashboard.render.com
2. Abra o serviço **youtube-pitch-player**
3. Vá em **Environment**
4. Clique **Add Environment Variable**
5. Preencha:
   - **Key:** `YOUTUBE_COOKIES`
   - **Value:** abra o `cookies.txt` no Bloco de Notas, **copie tudo** e cole aqui
6. Clique **Save Changes**
7. Aguarde o redeploy automático (~2 min)

## Passo 4 — Testar

Abra https://youtube-pitch-player.vercel.app e carregue um vídeo.

> Os cookies expiram após algumas semanas. Se parar de funcionar, exporte novamente e atualize a variável.
