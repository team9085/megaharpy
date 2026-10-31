# Mega Harpy #9085 — Administração de membros

Esta etapa adiciona ao portal:

- Convite de novos membros por e-mail;
- Definição de função (`member`, `reviewer`, `admin`) no convite;
- Listagem de contas e perfis;
- Edição de nome e nível de acesso;
- Suspensão e reativação de contas;
- Proteção contra rebaixar o último administrador ou suspender a própria conta;
- Verificação de administrador no servidor por meio de uma Supabase Edge Function.

## 1. Arquivos do site

Mescle as pastas `pages/`, `script/` e `style/` deste pacote com as pastas de mesmo nome do repositório `team9085/megaharpy`.

Arquivos novos:

- `pages/admin-membros.html`
- `script/admin-membros.js`

Arquivos atualizados (substitua as versões anteriores do portal):

- `pages/portal.html`
- `script/portal.js`
- `style/portal.css`

Não substitua `script/supabase-client.js`, `script/login.js`, `script/redefinir-senha.js` nem os arquivos principais do site.

## 2. Atualização do banco de dados

No Supabase, abra **SQL Editor → New query** e execute o conteúdo de `supabase/migration-admin-members.sql`.

A migração adiciona `profiles.is_active` e duas funções auxiliares para políticas RLS futuras:

- `public.is_active_member()`
- `public.current_user_has_role(required_role text)`

Ela não apaga nem substitui os perfis existentes. Os perfis atuais passam a ser ativos por padrão.

## 3. Criar a Edge Function

No Supabase Dashboard, abra **Edge Functions** e crie uma função chamada exatamente:

`admin-members`

Use o código de `supabase/functions/admin-members/index.ts` como código da função e faça o deploy.

**Mantenha a verificação JWT habilitada.** A função também valida a sessão com Auth e consulta o papel do solicitante em `public.profiles` antes de executar qualquer operação.

A função usa as variáveis de ambiente fornecidas pelo próprio Supabase (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS`). Ela tem compatibilidade de fallback com as variáveis antigas `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Não coloque uma secret key no frontend ou neste repositório.

### URL de convite

Por padrão, o convite redireciona para:

`https://team9085.github.io/megaharpy/pages/redefinir-senha.html`

Se o site da equipe estiver publicado em outro domínio/caminho, ajuste a constante `INVITE_REDIRECT_URL` no início da Edge Function antes do deploy.

Em **Authentication → URL Configuration → Redirect URLs**, adicione exatamente essa URL. A página de redefinição existente recebe o link de convite, valida a sessão e permite ao novo membro definir a senha.

## 4. Publicar o frontend

Envie os arquivos ao GitHub. Depois que o GitHub Pages publicar a atualização, entre no portal com uma conta cujo `profiles.role` seja `admin`.

No portal, o cartão **Administração** abre a página de gerenciamento de membros.

## 5. Testes recomendados

1. Entre com a conta administradora e abra Administração.
2. Convide um endereço de e-mail de teste que ainda não exista no Auth.
3. Confirme que o perfil aparece como `Convite pendente`.
4. Abra o e-mail de convite, defina uma senha e entre com essa conta.
5. Volte à conta administradora e altere a função do usuário de teste para `reviewer`.
6. Suspenda o usuário de teste e confirme que ele não consegue entrar novamente.
7. Reative o usuário e teste o login outra vez.
8. Tente rebaixar o único administrador: a função deve rejeitar a operação.

## Observações de segurança

- A interface não contém a secret key. Operações administrativas passam pela Edge Function.
- A função só aceita usuários autenticados cujo perfil tenha `role = 'admin'` e `is_active = true`.
- A suspensão marca `profiles.is_active = false` e aplica um bloqueio de autenticação. O portal também encerra a sessão quando detecta um perfil inativo.
- Para as futuras tabelas de relatórios, peças, montagens e FRACAS, as políticas RLS devem incluir `public.is_active_member()`; operações de aprovação devem também verificar `public.current_user_has_role('reviewer')` ou `public.current_user_has_role('admin')` conforme a regra definida.
- Esta etapa não exclui contas. Preservar o histórico técnico é preferível a apagar um membro que já participou de registros.
- O envio de convites depende do provedor de e-mail/SMTP configurado no Supabase e dos limites do plano.
