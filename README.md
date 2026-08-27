# Biblioteca Escolar (LeiaSJ) — Guia de Execução e Deploy

Projeto com **backend em Flask + SQLite** e **frontend em React (Vite)** para uma biblioteca escolar.

## 1. Pré-requisitos
- Python 3.10+
- Node.js 18+ (com `npm`)
- Git e uma conta no GitHub

## 2. Rodando localmente

### Backend (Flask)
```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python backend/app.py
```
A API sobe em `http://localhost:5000`. O banco `biblioteca.db` é criado automaticamente na primeira execução, já com um bibliotecário padrão:
- **Nome:** AdmLeia
- **Código:** LEIA-SJ-2025
- **Senha:** 12345

### Frontend (React/Vite)
Em outro terminal:
```bash
npm install
npm run dev
```
Acesse `http://localhost:5173`. Em desenvolvimento, o Vite já redireciona `/api` para `http://localhost:5000` (veja `vite.config.js`), então não precisa configurar nada extra.

## 3. Deploy gratuito — Backend no Render
1. Suba o projeto para um repositório no GitHub.
2. Acesse [render.com](https://render.com), crie uma conta e clique em **New + → Web Service**.
3. Conecte o repositório. O Render detecta o `render.yaml` automaticamente e usa:
   - **Build Command:** `pip install --root-user-action=ignore -r requirements.txt`
   - **Start Command:** `gunicorn backend.app:app`
4. As variáveis de ambiente já vêm definidas no `render.yaml`:
   - `FLASK_SECRET_KEY` (gerada automaticamente)
   - `DATABASE_PATH=/var/data/biblioteca.db`
   - `FRONTEND_ORIGIN` — depois que tiver o domínio da Vercel (passo 4), edite essa variável trocando `https://seu-site.vercel.app` pelo domínio real, mantendo `http://localhost:5173` para desenvolvimento.
   - `ENABLE_CROSS_SITE_COOKIES=true` e `SESSION_COOKIE_SECURE=true` (necessários para a sessão funcionar entre Render e Vercel).
5. O `render.yaml` já configura um **Persistent Disk** de 1 GB em `/var/data`, garantindo que o SQLite não se perca a cada deploy.
6. Clique em **Apply/Create** e aguarde o deploy. Copie a URL pública gerada, por exemplo:
   `https://biblioteca-backend.onrender.com`

> Plano gratuito do Render "dorme" depois de um tempo sem uso e demora alguns segundos para acordar na primeira chamada — normal.

## 4. Deploy gratuito — Frontend na Vercel
1. Acesse [vercel.com](https://vercel.com) e clique em **Add New… → Project**, conectando o mesmo repositório.
2. Mantenha o preset **Vite** e deixe **Root Directory** vazio (ou `.`) — o `package.json` está na raiz.
3. Comandos (preenchidos automaticamente):
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Em **Environment Variables**, adicione:
   - `VITE_API_URL` = URL pública do backend no Render (ex.: `https://biblioteca-backend.onrender.com`)
5. Faça o deploy. A Vercel vai gerar um domínio `https://seu-projeto.vercel.app`.
6. **Volte ao Render** e atualize a variável `FRONTEND_ORIGIN` com esse domínio real (separado por vírgula de `http://localhost:5173`), depois clique em "Manual Deploy" para reiniciar o backend com a nova configuração de CORS.

## 5. Checklist final
- [ ] Backend no ar no Render, URL pública funcionando (`/api/livros` deve responder em JSON)
- [ ] `VITE_API_URL` configurada na Vercel apontando para essa URL
- [ ] `FRONTEND_ORIGIN` no Render contendo o domínio real da Vercel
- [ ] Login do bibliotecário (AdmLeia / LEIA-SJ-2025 / 12345) funcionando em produção

## 6. Onde tudo roda localmente
- **Frontend dev:** `http://localhost:5173`
- **Frontend build (preview):** `npm run build && npm run preview` → `http://localhost:4173`
- **Backend Flask:** `http://localhost:5000`

Mantenha backend e frontend rodando em terminais separados durante o desenvolvimento local.
