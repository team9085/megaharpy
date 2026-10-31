# Mega Harpy — Portal de Membros (primeira etapa)

Este pacote adiciona ao site atual páginas independentes de login, portal e redefinição de senha. Não altera `index.html`, `script/script.js` nem os estilos existentes do site.

## Arquivos

Copie as pastas `pages/`, `script/` e `style/` deste pacote para a raiz do repositório `team9085/megaharpy`, mesclando com as pastas existentes.

Novos arquivos:

- `pages/login.html`
- `pages/portal.html`
- `pages/redefinir-senha.html`
- `script/supabase-client.js`
- `script/login.js`
- `script/portal.js`
- `script/redefinir-senha.js`
- `style/portal.css`

## Configuração no Supabase

1. Em **Authentication → URL Configuration**, configure o **Site URL** para a URL publicada do site da equipe.
2. Em **Redirect URLs**, adicione a URL exata da página de redefinição, por exemplo:
   `https://team9085.github.io/megaharpy/pages/redefinir-senha.html`
   Ajuste o domínio/caminho se o GitHub Pages estiver configurado de outra forma.
3. Confirme que o provedor Email está habilitado e que o cadastro público está desativado, conforme a configuração planejada.
4. Para convidar membros, use **Authentication → Users → Add user / Invite user** no Dashboard.
5. Promova o administrador inicial pelo SQL Editor, atualizando a coluna `role` do perfil correspondente.

## Uso e teste

Depois de enviar os arquivos ao GitHub:

- Login: `https://team9085.github.io/megaharpy/pages/login.html`
- Portal: `https://team9085.github.io/megaharpy/pages/portal.html`

A página `portal.html` redireciona para o login quando não existe uma sessão autenticada. O perfil é carregado de `public.profiles` usando a sessão atual.

Também é possível testar localmente a partir da raiz do repositório com:

```bash
python3 -m http.server 8000
```

Então abra `http://localhost:8000/pages/login.html`.

## Segurança — importante

- A publishable key incluída em `script/supabase-client.js` é destinada ao frontend. Não substitua por `service_role` ou qualquer chave `secret`.
- A interface esconde ferramentas conforme a função do usuário, mas isso não é a barreira de segurança. As tabelas e operações de dados precisam ter RLS e políticas próprias no PostgreSQL.
- O GitHub Pages serve os arquivos HTML publicamente. O que deve permanecer protegido são os dados e as operações no Supabase.
- A página de recuperação usa `resetPasswordForEmail()` e `updateUser()` do Supabase Auth. O destino precisa estar na lista de Redirect URLs.

## Escopo desta versão

Esta etapa implementa login com e-mail/senha, persistência da sessão, logout, consulta do perfil, exibição de permissões na interface e redefinição de senha. Os cartões de relatórios, engenharia, FRACAS, revisão e administração são apenas a estrutura visual inicial; ainda não executam operações de engenharia.
