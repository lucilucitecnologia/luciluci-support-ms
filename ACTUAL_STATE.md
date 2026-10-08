# ACTUAL_STATE

## Checkpoint de readiness/UAT — sem deploy

`main=origin/main=5caa7713ab40b64e9b499cf5bcbaf84645415200` integra a
[PR documental #18](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/18),
cujo head `ddff19d` passou na CI `quality` run `36494457557`. RF01–RF13
(14 operações) e seed W1 estão integradas; Support 0.15 permanece no gitlink
`14efcdf`. O [checkpoint de deployment readiness](docs/reports/REPORT-SUPPORT-DEPLOYMENT-READINESS-20260929-132805.md)
classifica `DEPLOYMENT_READINESS_BLOCKED_BY_ENVIRONMENT_DECISION / NO_GO`:
ambiente/plataforma/DB/owner, fronteira BFF, secrets, migrations controladas,
observabilidade, UAT e rollback ainda requerem decisão/prova. O CD atual
publica imagem GHCR por tag `v*`, sem implantar o serviço. Nenhuma tag,
release ou deploy foi feita neste lote; W1 segue restrita a banco descartável
local/CI. Os blocos seguintes preservam estados anteriores ao checkpoint.

## Seed W1 integrada em main

A [PR #17](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/17)
integrou a seed determinística W1 no merge
`1c1348d7f1bae38e5b926b69ae53564a295302e3` (parents `c417d8f` e
`cb92228`). A CI `ci / quality` do head funcional `cb92228` passou no
[run 36478828865](https://github.com/leonardodecuritiba/luciluci-support-ms/actions/runs/36478828865),
incluindo a proof PostgreSQL W1, a regressão RF01–RF13 e o smoke da imagem.
Estado: `SEED_W1_IMPLEMENTED_PROVEN_INTEGRATED_IN_MAIN`. A fixture continua
restrita a bancos descartáveis local/CI; não houve deploy, seed em ambiente
compartilhado nem aceitação de produção. Support 0.15 e as 14 operações
RF01–RF13 permanecem fixos. O
[fechamento W1](docs/reports/REPORT-SUPPORT-SEED-W1-MERGE-CLOSURE-20260928.md)
registra a evidência e os limites. Os blocos seguintes são fotografias
históricas de antes da integração.

## Revisão W1 local concluída

A [revisão separada da seed W1](docs/reports/REPORT-SUPPORT-SEED-W1-REVIEW-20260928-200426.md)
identificou e remediou host remoto permitido, janela com escritor externo,
readiness/search_path, timeline de auditorias e lacunas de prova. Duas proofs
PostgreSQL completas (UTC e São Paulo), 340 testes na suíte de coverage e o
smoke da imagem passaram. Estado:
`SEED_W1_REVIEW_PASS / READY_FOR_PUBLICATION` na branch local
`feat/support-seed-w1`; nenhum commit, push, PR, merge ou deploy. Support
0.15 e RF01–RF13 seguem fixos. O bloco seguinte registra o estado anterior
à revisão.

## Seed W1 implementada e provada localmente nesta feature

Na branch `feat/support-seed-w1`, descendente da definição documental
`4115ab5`, a seed do domínio completo está implementada com manifest
determinístico, gates antes da conexão, classificador
`EMPTY/EXACT_W1/DIVERGENT` e transação única. A
[prova PostgreSQL W1](docs/reports/REPORT-SUPPORT-SEED-W1-20260928-193318.md)
passou em bancos próprios descartáveis, incluindo no-op por `xmin`,
divergências, rollback, fusos e smoke HTTP. Estado nesta branch:
`SEED_W1=IMPLEMENTED_AND_PROVEN_ON_FEATURE_BRANCH`. A mudança ainda não foi
commitada, publicada, integrada ou implantada; Support 0.15 e RF01–RF13
permanecem fixos. Não declarar fechamento operacional final antes da
integração. A revisão posterior está registrada acima.

## Definição seed W1 aprovada; implementação pendente

O [fechamento W1](docs/reports/REPORT-SUPPORT-SEED-W1-DEFINITION-20260928-184122.md)
resolveu W1-01 por decisão expressa: opção B, fixture determinística do domínio
completo. Estados `SEED_W1_DEFINITION_READY`,
`SEED_W1_SCOPE=FULL_DOMAIN`, `SEED_W1_VOLUME=6/16/44/80` e
`SEED_W1_NOT_IMPLEMENTED`. A massa canônica
contém 6 Departments, 7 memberships, 8 atores sintéticos, 16 Tickets,
44 Messages, 8 Media rows e 80 AuditLogs. Os gates e a semântica de rerun
estão fechados no report. `scripts/seed.ts` ainda aborta antes de conectar;
o próximo lote é implementar e provar a seed. Support 0.15, RF01–RF13 e o
gitlink permanecem intactos; sem deploy ou prontidão de produção.

## Fotografia histórica — checkpoint seed W1 bloqueado

Na branch documental `docs/support-seed-w1-checkpoint`, o
[report W1](docs/reports/REPORT-SUPPORT-SEED-W1-CHECKPOINT-20260928-182459.md)
registra a tensão entre W1 histórica de Departments e a massa de domínio
completo proposta no TDD. Nenhuma fonte aprova a opção A ou B: estados
`W1_SEED_SCOPE_BLOCKED_BY_DECISION` e `SEED_W1_NOT_IMPLEMENTED`. A opção B
recebe uma proposta pequena e verificável, sem congelamento. `scripts/seed.ts`
segue bloqueado; o gitlink Support 0.15, RF01–RF13 e a baseline final não
mudaram. Não houve execução da seed nem deploy.

## Estado corrente — MAIN_BASELINE_RF13

A [PR funcional #15](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/15)
foi integrada em `main` por merge commit
`2aacc5554c9c2c4f25415dd8b170f5ff73b6d189`, com parents
`1e243d386dbca3e2d4dbf14fec7d29c8e5d1b366` e
`2741f0e2a68fc209d13e411f9533b628d96a6843`. Essa revisão é
`MAIN_BASELINE_RF13`: RF01–RF13, incluindo RF07a/RF07b separadamente, estão
`IMPLEMENTED_AND_PROVEN / INTEGRATED_IN_MAIN`; as 14 operações do PRD estão
materializadas. A CI `ci / quality` da PR #15 passou no run
[`36456698983`](https://github.com/leonardodecuritiba/luciluci-support-ms/actions/runs/36456698983)
no head exato `2741f0e`; a revisão independente foi
`RF13_REVIEW_PASS / READY_FOR_PUBLICATION`. O contrato canônico Support 0.15
permanece fixo no gitlink `14efcdfdc70d774c4343e2ec47662b7b5c8b691b`.
Não há RF pendente no escopo atual do PRD nem deploy realizado.

O [report de fechamento final](docs/reports/REPORT-SUPPORT-FINAL-CLOSURE-20260928-174429.md)
separa essa conclusão funcional das pendências operacionais: a seed de domínio
ainda está indisponível por falta de massa determinística W1, e implantação,
ambiente e aceitação de produção não foram provados. O drift técnico
`DRIFT-SUP-S1-001` permanece fechado; nenhum novo drift funcional RF13 foi
identificado. Esta branch documental registra o estado integrado; todas as
seções seguintes são fotografias históricas e não descrevem o estado corrente.

## Fotografia histórica — revisão independente RF13 local

A [revisão RF13](docs/reports/REPORT-SUPPORT-RF13-REVIEW-20260928.md)
reconfirmou contrato Support 0.15 e ACL/privacidade do histórico sem finding
P0/P1. O harness PostgreSQL passou a provar `datetime` idêntico em `UTC` e
`America/Sao_Paulo`, páginas compactadas, ausência de SELECT a TicketMessage
após RF11 e no-ops RF06/RF08. A integração HTTP cobre body JSON, whitespace e
UUID não-v4. As provas RF01–RF13 e o smoke foram reexecutados localmente.
Estado: `RF13_REVIEW_PASS / READY_FOR_PUBLICATION` na branch funcional; sem
commit, push, PR, merge ou deploy. Os blocos abaixo registram o lote anterior.

## Fotografia histórica — implementação RF13 na branch funcional

Na branch `feat/support-rf13-history`, descendente do checkpoint `7f041fd`,
RF13 está implementada sobre Support 0.15 (`14efcdf`). A rota
`GET /api/support/tickets/history` usa ACL atual e filtra auditorias ocultas
antes de count/página; ordena `datetime DESC,id DESC` e lê sob `REPEATABLE READ`
no PostgreSQL. O contrato OpenAPI, `api.http`, testes e proof PostgreSQL estão
no [report RF13](docs/reports/REPORT-SUPPORT-RF13-20260928.md). RF01–RF12
permanecem integradas em `main` (`1e243d3`); RF13 não foi integrada, publicada
em PR ou implantada. Nenhuma migration ou evento foi criado. As seções abaixo
são fotografias históricas.

## Fotografia histórica — fechamento contratual RF13 Support 0.15

As decisões expressas de 2026-09-28 fecharam os blockers remanescentes de
RF13. `GET /api/support/tickets/history` está
`RF13_CONTRACT_CHECKPOINT_READY / RF13_CONTRACT_FROZEN / NOT_IMPLEMENTED`.
Support 0.15 foi publicado na branch canônica
`docs/support-rf13-history-contract`, commit
`14efcdfdc70d774c4343e2ec47662b7b5c8b691b` (SHA local/remoto igual),
agora fixado no gitlink desta branch documental do serviço. O
[report de contrato](docs/reports/REPORT-SUPPORT-RF13-CONTRACT-20260928-141233.md)
registra a matriz completa. Os checkpoints `58fcea6` e `39028ec` permanecem
históricos; `main=origin/main=1e243d3` integra RF01–RF12.

RF13 exige ACL atual, filtro seguro de AuditLog antes de count/página, ordem
`datetime DESC,id DESC`, item exato de oito campos e snapshot PostgreSQL
`REPEATABLE READ`. Solicitante não vê `nova_mensagem` de admin. Não há
migration, rota funcional, OpenAPI RF13, teste executado ou deploy neste lote;
`/tickets/history` continua 404. A branch funcional
`feat/support-rf13-history` não foi criada. As seções seguintes são
fotografias anteriores ao fechamento.

## Decisão de visibilidade RF13 — contrato ainda bloqueado

A decisão expressa de 2026-09-25 fecha somente a exposição de
`AuditLog.nova_mensagem`: admin autorizado vê todo AuditLog do escopo; requester
dono vê apenas `nova_mensagem` com `origin=backoffice|cd` e
`authorId=ticket.requesterId`, nunca `origin=admin`. Filtrar antes do count e
da página, sem correlação heurística entre AuditLog e Message. `criacao_ticket`
e `alteracao_status` conservam a ACL geral do Ticket. Ver o
[report de visibilidade](docs/reports/REPORT-SUPPORT-RF13-VISIBILITY-20260925-203223.md).

DEC-SUP-01/09, DEC-SUP-02, DEC-SUP-08 e a fotografia de leitura concorrente
continuam blockers independentes no checkpoint anterior. Estado global:
`RF13_VISIBILITY_RESOLVED / RF13_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION /
NOT_IMPLEMENTED`. Support 0.15 não foi congelado; gitlink Support 0.14
`820b2a8` e reserva 404 inalterados. Esta seção é posterior ao checkpoint
histórico abaixo.

## Checkpoint RF13 após MAIN_BASELINE_RF12

A [PR #14](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/14)
integrou RF12 em `main` no merge
`1e243d386dbca3e2d4dbf14fec7d29c8e5d1b366`, com `ci` concluída em
`success` no run `36181786738` para o head `160aa1e`. `main` local e
`origin/main` coincidem. RF01–RF12 (incluindo RF07a/RF07b) estão
`IMPLEMENTED_AND_PROVEN`; RF13 permanece `NOT_IMPLEMENTED`, com `/history`
reservado em 404. O gitlink limpo continua Support 0.14 (`820b2a8`).

Nesta branch documental `docs/support-rf13-history-checkpoint`, RF13 está
`RF13_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION`: a fonte não define se o
solicitante vê uma auditoria `nova_mensagem` referente a nota interna, e o
AuditLog não contém `messageId` ou visibility para separá-las. Headers,
paginação/ordem, shape/erros e consistência de leitura também exigem decisão
específica RF13. Ver [report do checkpoint](docs/reports/REPORT-SUPPORT-RF13-CHECKPOINT-20260925-195255.md).
Support 0.15 não foi congelado; nenhum runtime, prova RF13 ou deploy foi feito
neste lote. As seções abaixo preservam fotografias históricas.

## Implementação RF12 — branch funcional

Nesta branch `feat/support-rf12-list-messages`, RF12 está
`IMPLEMENTED_AND_PROVEN` sobre Support 0.14 (`820b2a8`). A rota
`GET /api/support/tickets/{ticketId}/messages` usa ACL de Ticket, escopo de
visibilidade aplicado no SQL, paginação estrita, ordem `createdAt ASC,id ASC`,
mídia posicional em uma consulta por página e transação PostgreSQL
`REPEATABLE READ` sem lock ou write. Provas locais estão no
[report RF12](docs/reports/REPORT-SUPPORT-RF12-20260925.md).
RF01–RF11 permanecem integradas/provadas em `main` (`7724382`); RF12 ainda não
foi integrada ou implantada. RF13 segue `NOT_IMPLEMENTED`.
As seções seguintes são fotografias históricas.

## Fechamento contratual RF12 — Support 0.14

O checkpoint bloqueado `98efe16` permanece histórico. Decisões expressas
congelaram somente RF12 em Support 0.14, publicado no commit canônico
`820b2a8b29819fc52aefd078dc51bfe651a51204` e fixado no gitlink desta
branch. Estado `RF12_CONTRACT_CHECKPOINT_READY / RF12_CONTRACT_FROZEN /
NOT_IMPLEMENTED`. RF01–RF11 permanecem `IMPLEMENTED_AND_PROVEN` em
`MAIN_BASELINE_RF11` (PR #13 documental no merge `7724382`); RF13 segue
`NOT_IMPLEMENTED`. Nenhum runtime, teste funcional RF12 ou deploy foi criado.
O [report de fechamento RF12](docs/reports/REPORT-SUPPORT-RF12-CONTRACT-20260925-185019.md)
registra as decisões, publicação e limites.

`GET /api/support/tickets/{ticketId}/messages` exige headers de correlação e
ator, ACL do Ticket e paginação. Admin com membership atual pode ver todas as
mensagens; requester dono vê apenas `isVisibleToRequester=true`. Para
requester, filtro `false` é válido e retorna página vazia/total zero sem
consultar notas internas. Ordem `createdAt ASC,id ASC`, item completo de oito
campos, mídia posicional em lote e fotografia PostgreSQL `REPEATABLE READ`
sem lock pessimista ou write. RF12 não gera AuditLog, evento ou migration.
As seções seguintes preservam fotografias anteriores.

## Fotografia histórica — checkpoint RF12 bloqueado por decisão

A PR documental [#13](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/13)
foi integrada em `main` no merge `7724382245545c5918262ebb66aff0d696b0a2b2`,
após `ci / quality` aprovado no run `36171699704`. `main` local e remota
coincidiram nesse commit; `MAIN_BASELINE_RF11` mantém RF01–RF11
`IMPLEMENTED_AND_PROVEN`. Naquele checkpoint, o gitlink continuava Support
0.13 `4958fd1`.

O checkpoint documental de RF12, `GET /api/support/tickets/{ticketId}/messages`,
tem estado `RF12_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION`. A fonte fixa rota,
filtro opcional `isVisibleToRequester`, paginação, ACL geral do Ticket e
auditoria zero, mas não fecha a projeção segura de mensagens internas para
solicitantes, incluindo filtro omitido/`false` e `total`. Também faltam decisões
específicas de paginação/ordem, resposta, validações e consistência de leitura.
Ver [report RF12](docs/reports/REPORT-SUPPORT-RF12-CHECKPOINT-20260925-182925.md).
Naquela fotografia, Support 0.14 não estava congelado; RF12/RF13 seguiam
`NOT_IMPLEMENTED`, sem branch
funcional RF12 ou deploy. As seções seguintes preservam fotografias anteriores.

## Fotografia histórica — MAIN_BASELINE_RF11

RF01–RF11 estão `IMPLEMENTED_AND_PROVEN` e integradas em `main`. A
[PR #12](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/12)
integrou RF11 em 2026-09-25 no merge
`9387b3dc6e636db4b8124785e7b3bc92ec46d054`, estabelecendo
`MAIN_BASELINE_RF11`. O head funcional publicado foi `d15fe7d`; o check
remoto `ci / quality` passou no run `36169743450`. `main` local e
`origin/main` coincidem no merge; o gitlink limpo aponta para Support 0.13
`4958fd1840042200fd1a87e45d6a7f69d4011dcd`.
A rota `PATCH /api/support/tickets/{ticketId}/messages/{messageId}/visibility`
altera somente a visibilidade de mensagens admin, com ACL por membership atual
e locks Ticket→Department→Message. No-op retorna 200 sem UPDATE.
RF12/RF13 seguem sem runtime; não houve deploy. Evidência local em
[report RF11](docs/reports/REPORT-SUPPORT-RF11-20260925.md). O report
registra o fechamento da implementação anterior à publicação.

## Fotografia histórica — fechamento contratual RF11 — Support 0.13

O checkpoint bloqueado `85b3adb` permanece histórico. Decisões expressas
posteriores congelaram somente RF11 em Support 0.13, commit canônico publicado
`4958fd1840042200fd1a87e45d6a7f69d4011dcd` (SHA local/remoto igual).
O gitlink foi avançado para essa revisão somente após sua publicação.
Estado `RF11_CONTRACT_CHECKPOINT_READY / RF11_CONTRACT_FROZEN /
NOT_IMPLEMENTED`. [Report de fechamento](docs/reports/REPORT-SUPPORT-RF11-CONTRACT-20260925-165105.md).

`PATCH /api/support/tickets/{ticketId}/messages/{messageId}/visibility` é
contrato `admin-only`: membership atual no Department do Ticket, inclusive
inativo; só Message `type=admin` é editável, independentemente do admin autor.
Body estrito `isVisibleToRequester` boolean, `200` com TicketMessage completa;
mesmo valor é no-op sem write. Mutação efetiva atualiza somente a coluna de
visibilidade da Message; Ticket/`updatedAt`, mídia, status e AuditLog não mudam.
Transação e locks seguem Ticket→Department→Message. Sem idempotency key,
evento ou migration nova. DEC-SUP-01/03/04/06/08/09/10/12 estão resolvidas
somente para RF11; DEC-SUP-11 não se aplica.

RF01–RF10 continuam `IMPLEMENTED_AND_PROVEN` em `MAIN_BASELINE_RF10`.
RF11–RF13 são `NOT_IMPLEMENTED`; a branch
`feat/support-rf11-message-visibility` não foi criada. Nenhum teste funcional
RF11 ou deploy ocorreu neste fechamento documental.

## Fotografia histórica — checkpoint RF11 bloqueado por decisão

Em `docs/support-rf11-message-visibility-checkpoint`, a partir de
`MAIN_BASELINE_RF10` (`734ba5de74e544b1e8dc2a31c135cb2bb54d20e1`),
o confronto entre PRD original, PRD transposto, notes, TDD e TP encontrou
lacunas materiais para `PATCH /api/support/tickets/{ticketId}/messages/{messageId}/visibility`.
Estado: `RF11_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION`. A fonte confirma o
campo booleano `isVisibleToRequester`, ACL geral de Ticket, mudança exclusiva
desse campo e ausência de AuditLog; não fecha permissão por ação, conjunto de
mensagens elegíveis, restrição de autor, transições, no-op, response,
`Ticket.updatedAt`, idempotência e concorrência. O
[report RF11](docs/reports/REPORT-SUPPORT-RF11-CHECKPOINT-20260925-161025.md)
registra a matriz de fontes e decisões pendentes.

Naquele checkpoint, Support 0.13 **não** estava congelado; `luciluci-docs` e seu gitlink permaneciam
em Support 0.12 (`85c7e958adb0cbb9fa43842de7f990260f2bc0ee`). RF11 é
`NOT_IMPLEMENTED`; a branch `feat/support-rf11-message-visibility` não foi
criada. RF12/RF13 também seguem `NOT_IMPLEMENTED`. Nenhum deploy.

## Fotografia histórica — MAIN_BASELINE_RF10 antes do fechamento RF11

RF01–RF10 estão `IMPLEMENTED_AND_PROVEN` e integradas em `main`. A
[PR #10](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/10)
integrou RF10 no merge `8827c0b2f6d0b7597984f5131d4f1ec7b658084f`,
estabelecendo `MAIN_BASELINE_RF10`. O head funcional foi `50ffbf6`, e o check
remoto `ci / quality` passou no run `36156561044`. Naquela fotografia, o gitlink permanecia em
Support 0.12 `85c7e958adb0cbb9fa43842de7f990260f2bc0ee`.
RF11–RF13 continuam `NOT_IMPLEMENTED`. Não houve deploy.

`POST /api/support/tickets/{ticketId}/messages` valida headers e coerência do
body, aplica ACL após Ticket lock e, para admin, Department lock. Mensagem,
mídias posicionais, atualização estreita do Ticket e auditorias são uma
transação. Admin gera uma auditoria; backoffice/cd geram duas, inclusive se
`adminStatus` já era `pendente`. Cada POST válido cria mensagem nova e renova
`updatedAt`; não há idempotency key, evento nem migration nova.

Evidência da RF10: 29 suítes/262 testes, cobertura 98,03% statements,
87,38% branches, 98,72% functions e 98,44% lines; prova RF10 em PostgreSQL 16
descartável com quatro rollbacks e RF10×RF10/RF06/RF08; regressões PostgreSQL
RF01–RF09; smoke da imagem RF10. O report de implementação em `docs/reports/`
registra comandos, resultados e limites. A primeira execução da cobertura em
sandbox falhou por `listen EPERM`; a repetição com permissão de bind local passou.
As linhas históricas abaixo descrevem checkpoints anteriores à implementação.

## Fotografia histórica — MAIN_BASELINE_RF09 e contrato RF10 Support 0.12

- serviço `support-ms`; domínio `support`;
- S1 `BOOTSTRAP_IMPLEMENTED_AND_PROVEN`; drift `DRIFT-SUP-S1-001 / RESOLVED / PROVEN`;
- RF01–RF09 `IMPLEMENTED_AND_PROVEN` e integradas em `main`; RF10–RF13 `NOT_IMPLEMENTED`;
- baseline naquele checkpoint `MAIN_BASELINE_RF09`, merge da PR #9 `393af3ed50c35fb541825c1822cecaa3b8005a29`; RF08 permanece histórica em `45be90318bdb71e67532482364933cb49e6660e9`;
- RF07a/RF07b `RF07A_RF07B_CONTRACT_FROZEN` em Support 0.9; implementação e prova PostgreSQL local concluídas;
- contrato RF06 congelado em Support 0.8, commit canônico `4650ec671c948a4fa8fb04fa33b300d8fd255ae4` de `luciluci-docs`;
- decisões RF06 DEC-SUP-01/03/05/06/08/09/10/12 resolvidas somente nesse recorte; DEC-SUP-01/02/07/08/09 estão `RESOLVED_FOR_RF07` somente para RF07a/RF07b, conforme `luciluci-docs/support/notes.md`;
- gitlink naquela fotografia Support 0.12 `85c7e958adb0cbb9fa43842de7f990260f2bc0ee`, publicado em `origin/docs/support-rf10-create-message-contract` e confirmado por `ls-remote`; a revisão 0.11 `a198b46c62d4b5cd1a4aa0ced8eb171b2e6ef3b2` permanece histórica. O contrato RF07 0.9 permanece histórico em `1583a586793437a7b7c0569581637ee8ddac5ae5`; `RF07_IMPLEMENTATION_BASELINE = MAIN_BASELINE_RF06`.

## Fechamento contratual RF10 — Support 0.12

O checkpoint bloqueado no commit `8498620803e206f4ef0fa481835af5270db1f721` permanece histórico. As decisões posteriores congelaram somente a criação de mensagem em `POST /api/support/tickets/{ticketId}/messages`: preservar `type` e `authorId` no body e validar coerência com os headers de ator; ACL por membership atual para admin e ownership para backoffice/cd; mensagem de solicitante sempre visível; resposta `201` com TicketMessage; cada POST válido cria uma mensagem distinta, renova `updatedAt` e usa transação/locks Ticket→Department para admin. Admin gera uma auditoria `nova_mensagem`; backoffice/cd geram `nova_mensagem` mais `alteracao_status/admin/pendente` mesmo se já pendente. DEC-SUP-01/04/06/08/09/10/12 estão `RESOLVED_FOR_RF10`; DEC-SUP-05/11 não se aplicam. O contrato 0.12 está no commit canônico `85c7e958adb0cbb9fa43842de7f990260f2bc0ee`. Estado `RF10_CONTRACT_CHECKPOINT_READY / RF10_CONTRACT_FROZEN / NOT_IMPLEMENTED`; nenhum teste ou runtime RF10 foi criado nesta revisão.

## Merge RF09 e checkpoint RF10

A [PR #9](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/9), head `93fd4832f7275691973b547443144b8246194fa7`, foi integrada em 2026-09-25 no merge `393af3ed50c35fb541825c1822cecaa3b8005a29`. O check `ci / quality` passou no run `36145983860`; não havia reviews ou review threads, e não houve conflito. `main` local e `origin/main` coincidiram no merge; a branch funcional é ancestral de `main`. Nenhum deploy foi executado.

A branch documental `docs/support-rf10-create-message-checkpoint` parte dessa baseline. O [report RF10 histórico](docs/reports/REPORT-SUPPORT-RF10-CHECKPOINT-20260925-143047.md) registra as lacunas antes da decisão; o fechamento 0.12 acima as resolve sem reescrever esse checkpoint. Naquele momento, `feat/support-rf10-create-message` não tinha sido criada e RF10 seguia sem runtime.

## Implementação RF09 — branch funcional

A branch `feat/support-rf09-get-ticket` partiu de `origin/codex/support-rf09-contract-checkpoint` (`f76c217`), descendente de `MAIN_BASELINE_RF08`, com gitlink canônico Support 0.11 fixo em `a198b46`. `GET /api/support/tickets/{ticketId}` retorna somente os onze campos de Ticket. `backoffice`/`cd` leem por `requesterId`; admin lê por membership atual no Department, inclusive inativo. O caso de uso consulta Ticket antes da ACL para distinguir 404 de 403. Não há lock, transação de escrita, auditoria, evento, outbox, idempotência ou migration RF09. RF10–RF13 permanecem indisponíveis.

Testes unitários, integração HTTP/SQLite e contrato OpenAPI foram acrescentados. A prova `proof:rf09:postgres` passou em PostgreSQL 16 descartável com processo compilado, validando ACL, resposta exata, erros e snapshots físicos de `departments`, `department_allowed_users`, `tickets`, `ticket_messages`, `ticket_message_media` e `ticket_audit_logs` antes/depois dos GETs. A suíte completa passou com 27 suítes e 239 testes; cobertura: 97,93% statements, 87,16% branches, 98,62% functions, 98,28% lines. O smoke da imagem passou com leitura requester/admin. Regressões PostgreSQL RF01–RF08 e demais gates estão no report RF09. A implementação foi publicada no commit `a925f53bea438b456b4ea50ac290f81cbc10a881`; a PR e seu check remoto foram concluídos conforme o bloco acima.

As referências abaixo que dizem RF09 sem runtime são fotografias históricas dos checkpoints anteriores à implementação, não o estado desta branch.

## Integração RF08 e abertura RF09

A [PR #8](https://github.com/leonardodecuritiba/luciluci-support-ms/pull/8) foi integrada no merge `45be90318bdb71e67532482364933cb49e6660e9`; `main` local e `origin/main` coincidiram após fast-forward. O check `quality` do head `ab43d4e53e0d4fde70a66c42a8f38fc9e66806ad` passou no run remoto `36065884933`. A documentação canônica Support 0.10 é a fotografia anterior ao runtime RF08: seu `NOT_IMPLEMENTED` histórico não descreve o estado atual do serviço. O submódulo está limpo no gitlink fixado.

O checkpoint RF09 histórico está em `docs/reports/REPORT-SUPPORT-RF09-CHECKPOINT-20260924-223334.md`, estado então `RF09_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION`. PRD §5.2/RF09 fixava GET por ID, ACL e leitura sem auditoria; TDD/TP deixavam DEC-SUP-01/08/09 pendentes naquele momento. A rota GET por ID ainda não existe; essa ausência é esperada no lote documental.

## Fechamento contratual RF09 — Support 0.11 publicado

Em 2026-09-25, o usuário aprovou expressamente a proposta do checkpoint RF09. O contrato Support 0.11 foi registrado em `luciluci-docs/support/{README,prd,notes,tdd,tp}.md`, commit canônico `a198b46c62d4b5cd1a4aa0ced8eb171b2e6ef3b2` na branch `docs/support-rf09-get-ticket-contract`; o gitlink desta branch do serviço aponta a esse SHA. DEC-SUP-01/08/09 estão `RESOLVED_FOR_RF09` apenas para GET por ID; `RF09_CONTRACT_CHECKPOINT_READY / RF09_CONTRACT_FROZEN / NOT_IMPLEMENTED`. O report de fechamento está em `docs/reports/REPORT-SUPPORT-RF09-CONTRACT-20260925-125528.md`. O checkpoint bloqueado anterior permanece histórico.

O primeiro push do commit canônico para `git@github.com:lucilucitecnologia/luciluci-docs.git` foi rejeitado pela revisão automática: a aprovação do contrato não foi considerada autorização explícita para publicar documentos naquele remoto. Após autorização específica do usuário, a branch canônica foi publicada e `ls-remote` confirmou `a198b46c62d4b5cd1a4aa0ced8eb171b2e6ef3b2`. A branch do serviço `codex/support-rf09-contract-checkpoint` também foi publicada; `ls-remote` confirmou o head inicial `c586fdba037eb463b0841be9b99e9c8dbdcd0953` com o mesmo gitlink. Nenhuma PR RF09 foi aberta e nenhum arquivo de runtime, OpenAPI executável, `api.http`, migration, teste ou prova RF09 foi criado.

## Superfície implementada

RF01–RF04 operam Department e RF05 cria Ticket, mensagem inicial, mídias e uma auditoria em transação. RF06 expõe `PATCH /api/support/tickets/{ticketId}` para `priority`, `departmentId` e `adminStatus`, com headers de ator e correlação obrigatórios, ACL por membership do Department atual para admin ou ownership para backoffice/cd, validação do target ativo, no-op sem write e auditoria `alteracao_status` somente em mudança efetiva de `adminStatus`.

O update RF06 bloqueia Ticket antes dos Departments, estes em ordem lexical de UUID, revalida autorização e estado sob lock e executa update e eventual AuditLog em uma única transação. A migration RF05 já suporta os valores de status e origem de auditoria necessários; RF06 não adiciona migration. Não há evento, outbox ou idempotência HTTP para RF06. Seed W1 permanece bloqueada até massa determinística aprovada.

## Evidência RF06 e estado remoto

- `npm run build`, `npm run lint`, testes unitários RF06 (2), integração RF06 (29), contrato OpenAPI (2) passaram.
- `npm run proof:rf06:postgres` passou em PostgreSQL 16, banco exclusivo `support_s1_proof_rf06_20260924` criado e descartado pelo script. A prova exercitou processo compilado, ACL, no-op, auditoria, rollback induzido na auditoria, espera pelo lock do Ticket e revalidação do target após lock de Department.
- A suíte completa passou com 21 suítes/177 testes. Cobertura: 98,17% statements, 85,18% branches, 98,31% functions e 98,38% lines. OpenAPI export/check e compatibilidade contra RF05, build/check e `messaging:check` passaram. O teste RF04 historicamente fixado em RF06=404 foi atualizado para verificar apenas RF07–RF13.
- Replay local das seis provas PostgreSQL RF01–RF06 passou em PostgreSQL 16, cada uma com banco exclusivo criado e descartado. O workflow ganhou step RF06; as provas antigas foram alinhadas à nova rota.
- PR #5 `MERGED`: https://github.com/leonardodecuritiba/luciluci-support-ms/pull/5. Head `204ab0c9cfa09052539db9272dd03e4c47aa9084`; CI final `36032135712` aprovada; merge `0387167cfe02416c5d05cf3b8288350dd5ba682b` verificado em `main`/`origin/main` e na página da PR. A página ainda mostra `No reviews`; nenhuma revisão formal foi observada. O merge ocorreu fora deste checkpoint, sem ação de integração nesta branch.

Reports anteriores registram as provas S1 e RF01–RF05. A prova RF05 anterior cobriu schema, rollback, sequence, concorrência e imagem. Nenhuma prova de RF06 é atribuída retroativamente às outras RFs.

## Checkpoint RF07a/RF07b

RF07a preserva `GET /api/support/tickets/requester/{requesterId}` para próprios tickets. RF07b preserva `GET /api/support/tickets/admin/{adminId}` e restringe o escopo por membership atual em `allowedUserIds` do Department. O contrato 0.9 fecha headers/roles, ACL no banco, filtros AND, `DD/MM/YYYY` em dias UTC de `Ticket.createdAt`, paginação com defaults `page=1,size=20`, ordem `createdAt DESC,id DESC`, envelope, item de nove campos (inclui `subject`, adicionado após o congelamento 0.9) e matriz de erros. Ambos são leituras sem AuditLog ou efeitos de escrita. A branch funcional inclui as rotas, consulta, testes unitários/de integração, OpenAPI executável, `api.http` e prova PostgreSQL/processo compilado. Nenhuma migration RF07 foi criada.

A prova PostgreSQL 16 RF07 passou em banco exclusivo descartado pelo script, com ACL, filtros, limites UTC, paginação, projeção exata, OpenAPI e snapshots de Ticket/mensagem/auditoria sem escrita. A repetição com processo em `TZ=America/Sao_Paulo` detectou e depois comprovou a correção da conversão de `timestamp` sem fuso do driver `pg`; `createdAt` e filtros agora preservam os dias UTC independentemente do fuso do processo. `npm run lint`, `build`, `build:check`, export/check/compatibilidade OpenAPI contra RF06, `messaging:check`, 23 suítes/201 testes e `coverage:check` passaram. Cobertura: 97,94% statements, 87,05% branches, 98,47% functions, 98,34% lines. Regressões PostgreSQL RF01–RF06 passaram em bancos exclusivos descartados; os clientes de prova históricos foram executados com `TZ=UTC`. A PR #7 foi aberta e marcada Ready for Review; sua CI remota inicial passou no run `36047611567`, job `quality`, head `65029bd691c004612a47599aac44ebaef1e1a661`, incluindo prova RF07, regressões RF01–RF06, imagem, contrato e cobertura. Nenhuma revisão humana foi observada.

## Continuidade

O checkpoint bloqueado anterior é histórico. A revisão 0.9 está congelada e publicada no repositório canônico; a PR documental #6 foi integrada em `main` no merge `939b991`. A PR #7 integrou a implementação RF07 após CI remota aprovada no head conciliado. O merge do checkpoint documental não mudou o contrato 0.9 nem o gitlink.

## Checkpoint contratual RF08

O merge da PR #7 em `43a556ab1c70f5de9a63e3e6ab651445fa462173` estabelece `MAIN_BASELINE_RF07`; a CI `quality` do head conciliado passou no run `36049802944`. A página da PR mostrou `No reviews`, discrepância processual histórica que não reabre RF07. O checkpoint documental bloqueado no commit `a8714a86b5b67e9a7e7fafaf194991b0e078e9cb` preserva a fotografia anterior, com gitlink Support 0.9.

As decisões posteriores fecham o contrato RF08 em Support 0.10: POST sem body; headers `X-Correlation-ID`, `X-Performed-By` e `X-Performed-By-Type=backoffice|cd`; somente dono por `ticket.requesterId`, sem comparar role com origin ou verificar Department. Transição `nao_resolvido -> resolvido` altera apenas requesterStatus/updatedAt e cria exatamente um AuditLog `alteracao_status` de requester na mesma transação. Ticket já resolvido retorna `200` e Ticket completo sem write, timestamp ou auditoria novos. Ticket é bloqueado com `FOR UPDATE`; RF08×RF08 e RF06×RF08 serializam sem perda de update. Não há idempotency key, evento/outbox ou mensageria. Matriz de erros: `400` headers, `403` admin/não dono, `404` Ticket inexistente, `422` UUID/body, `500` inesperado. DEC-SUP-01/06/08/09/10/12 estão `RESOLVED_FOR_RF08` somente neste recorte; DEC-SUP-11 é `NOT_APPLICABLE_RF08`. O commit canônico `93edf66d6ed0002a2af537339da315db1285a779` está publicado, e o gitlink desta branch aponta a ele. RF09–RF13 seguem pendentes.

## Implementação RF08 — evidência histórica da branch funcional

`POST /api/support/tickets/{ticketId}/resolve` está materializado em route/controller,
`ResolveTicketUseCase` e capacidade específica `updateRequesterStatus` do repositório.
O controller rejeita qualquer body presente, inclusive `null` e `{}`, valida
headers/path e executa o caso de uso em transação. O caso de uso bloqueia o Ticket
antes de ler ownership/status, permite somente requester owner e não consulta
Department. A transição persiste só `requesterStatus` e `updatedAt`, com um
AuditLog requester de mesmo timestamp; o no-op retorna Ticket completo sem write.
RF06 mantém sua atualização restrita própria. Não há migration nova, evento,
outbox, idempotency key ou branch RF09.

A prova `proof:rf08:postgres` passou em PostgreSQL 16 descartável com processo
compilado: transição, no-op, Department inativo, ACL, falha induzida de AuditLog
com rollback, RF08×RF08 e RF06×RF08 sob lock real, sem lost update ou deadlock.
O primeiro replay falhou por leitura local de `timestamp` sem fuso no cliente da
prova; o script foi alinhado à interpretação UTC do serviço e o replay passou.
Provas RF01–RF07, smoke da imagem e gates finais são registrados no report RF08.
Este resultado local não equivale a CI remota ou integração em `main`.
