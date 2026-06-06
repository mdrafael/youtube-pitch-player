# YouTube Pitch Player

Incorpora vídeos do YouTube e altera o **tom (pitch)** do áudio em tempo real.

## Como funciona

1. Você cola o link do YouTube
2. O servidor **extrai o áudio em MP3** (yt-dlp + ffmpeg)
3. O vídeo aparece no player do YouTube (mudo)
4. O MP3 é reproduzido com **Web Audio API + SoundTouch** — o slider altera o tom sem mudar a velocidade

## Requisitos

- [Node.js](https://nodejs.org/) (LTS)
- Conexão com a internet (primeira execução baixa o `yt-dlp` automaticamente)

## Uso

```bash
cd youtube-pitch-player
npm install
npm run dev
```

Abra **http://localhost:5173**

1. Cole o link e clique em **Extrair e carregar**
2. Aguarde a extração do MP3 (vídeos longos demoram mais)
3. Reproduza o vídeo e ajuste o tom (−12 a +12 semitons)

## Estrutura

- `server.js` — extração MP3 com yt-dlp
- `data/audio/` — MP3s em cache (um por vídeo)
- `js/audio-pitch.js` — processamento de pitch
- `js/youtube-player.js` — iframe do YouTube

## Observações

- A primeira extração de cada vídeo pode levar 1–3 minutos
- Reabrir o mesmo vídeo usa o cache (instantâneo)
- O projeto em pasta do **OneDrive** pode causar erros no `npm install` — prefira `C:\projetos\`
