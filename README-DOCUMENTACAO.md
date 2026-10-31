# Mega Harpy #9085 — Etapa 3: Documentação de engenharia

Esta atualização adiciona a primeira versão do módulo de documentação, começando pelo Relatório de Usinagem.

## Regras implementadas

- **Visibilidade:** todo membro ativo pode consultar todos os relatórios, inclusive rascunhos (`team`).
- **Edição:** o autor pode editar o próprio rascunho ou documento devolvido para correção.
- **Revisão:** `reviewer` e `admin` podem aprovar ou solicitar correções de documentos enviados. Conforme a decisão da equipe, revisores e administradores também podem revisar documentos dos quais sejam autores.
- **Status:** `draft`, `submitted`, `changes_requested`, `approved`.
- **Auditoria:** o sistema registra autor, revisor, datas, decisões e comentários da revisão.
- **Código:** a primeira sequência gera `REL-MEC-0001`, `REL-MEC-0002` etc. Este é um padrão inicial proposto a partir do prefixo `REL-MEC-` do formulário; confirme com a equipe antes de tratar o padrão como definitivo.

## 1. Pré-requisitos

O projeto Supabase já deve conter:

- `public.profiles` com `id`, `full_name`, `role` e `is_active`;
- `public.is_active_member()`;
- `public.current_user_has_role(text)`;
- Supabase Auth e a sessão já funcionando no portal.

Esses itens foram criados nas etapas anteriores.

## 2. Executar a migração SQL

No Supabase Dashboard:

1. Abra **SQL Editor**.
2. Crie uma nova query.
3. Cole o conteúdo de `supabase/migration-documentation.sql`.
4. Execute.

A migração cria:

- `documents`: identificação comum, código, autor, execução, status e revisão;
- `machining_reports`: campos específicos de usinagem;
- `dimensional_checks`: cotas dimensionais em linhas dinâmicas;
- `document_reviews`: histórico das decisões de revisão;
- sequências para os códigos dos seis tipos de documento;
- políticas RLS, privilégios de coluna e funções de submissão/revisão.

A interface desta etapa cria somente documentos do tipo `machining`. As demais sequências e o campo `document_type` já deixam a base preparada para futuras etapas, mas os outros formulários ainda não estão implementados.

**Importante:** execute a migração uma única vez. Ela usa `IF NOT EXISTS` e substitui políticas/funções nomeadas, mas não foi projetada como ferramenta de rollback. Leia a saída do SQL Editor e interrompa se houver erro.

## 3. Instalar os arquivos do site

Mescle as pastas `pages/`, `script/` e `style/` deste pacote com as pastas correspondentes do repositório `team9085/megaharpy`.

Arquivos novos:

- `pages/documentos.html`
- `pages/relatorio-usinagem.html`
- `script/documentos.js`
- `script/relatorio-usinagem.js`
- `style/documentos.css`

Arquivo atualizado:

- `pages/portal.html` (o cartão Relatórios agora abre Documentação)

**Não substitua** `script/supabase-client.js`, `script/portal.js`, `style/portal.css`, `script/login.js` ou os arquivos administrativos.

Os novos HTMLs reutilizam `../script/supabase-client.js` e o CDN do Supabase JS v2 já usado pelo portal.

## 4. Fluxo de uso

1. Entre no portal com um membro ativo.
2. Abra **Documentação**.
3. Clique em **Novo relatório de usinagem**.
4. Preencha os campos e salve o rascunho. O código é atribuído pelo banco ao salvar pela primeira vez.
5. Adicione quantas cotas dimensionais forem necessárias.
6. Quando os campos essenciais estiverem completos e os horários informados, clique em **Enviar para revisão**.
7. Um usuário `reviewer` ou `admin` abre o documento e aprova ou solicita correções.
8. Quando aprovado, o documento fica somente para leitura.

A página também oferece **Imprimir / salvar PDF**, usando a função de impressão do navegador. A geração de PDF padronizado com o layout oficial e anexos é uma melhoria posterior.

## 5. Observações sobre o formulário

- Os campos e critérios foram transpostos do Relatório de Usinagem fornecido pela equipe: identificação, tipo início/continuação/final, código da peça, material, dimensões do bruto, máquina, operações, ferramentas, validação dimensional, ocorrências, refugo e quantidade produzida.
- A grade dimensional é dinâmica, em vez de limitar o registro às linhas do formulário de papel.
- A assinatura manuscrita foi substituída nesta primeira versão pela identidade autenticada, pelo registro de revisor e pelos horários de submissão/aprovação. Isso constitui trilha de auditoria do sistema, não uma assinatura digital qualificada/certificado ICP-Brasil.
- Os relatórios são visíveis a todos os membros ativos conforme a regra escolhida. Rascunhos também ficam visíveis à equipe.
- Membros comuns não podem alterar status ou inserir avaliações diretamente. As transições de submissão e revisão passam por funções SQL com verificações de papel.

## 6. Testes recomendados

1. Execute a migração SQL e confira que terminou com `Success`.
2. Publique os arquivos no GitHub Pages.
3. Acesse `pages/documentos.html` com uma conta ativa.
4. Crie um rascunho, salve e confirme que recebeu um código `REL-MEC-####`.
5. Adicione duas ou três cotas, salve, atualize a página e confirme que continuam presentes.
6. Complete os campos obrigatórios e horários; envie para revisão.
7. Entre com uma conta `reviewer` ou `admin`, abra o documento e aprove ou solicite correções.
8. Confirme que o autor consegue editar quando o documento volta para correção e que o documento aprovado fica bloqueado para edição.
9. Teste com um segundo membro ativo para confirmar que consegue visualizar o mesmo documento, sem poder alterá-lo.

## 7. Limitações desta primeira versão

- Só o Relatório de Usinagem está disponível para criação.
- Ainda não há upload de anexos neste formulário.
- A impressão do navegador fornece uma cópia para PDF, mas ainda não há template PDF oficial automatizado.
- A tela de lista apresenta somente relatórios de usinagem por enquanto.
- A trilha de revisão registra as decisões, mas a tela de histórico detalhado será adicionada posteriormente.
