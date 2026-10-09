# DRIFT_REPORT

## W1 integrada sem drift funcional novo

A PR #17 integrou a seed W1 em `main` no merge `1c1348d`. A CI remota
`ci / quality` do head `cb92228` passou no run `36478828865`, incluindo
proof W1 e RF01–RF13. Os cinco findings da revisão W1 foram fechados antes
da publicação; nenhum drift funcional novo foi identificado. O
[fechamento W1](docs/reports/REPORT-SUPPORT-SEED-W1-MERGE-CLOSURE-20260928.md)
registra a evidência. Sem deploy, seed em ambiente compartilhado ou prova de
produção. As seções abaixo preservam estados anteriores.

## Revisão local W1

O [review W1](docs/reports/REPORT-SUPPORT-SEED-W1-REVIEW-20260928-200426.md)
fechou cinco findings locais antes de publicação; nenhum drift funcional
RF01–RF13 permanece aberto nesta feature. Estado
`SEED_W1_REVIEW_PASS / READY_FOR_PUBLICATION`, ainda sem commit, PR ou deploy.
O bloco seguinte preserva a fotografia anterior à revisão.

## Feature local W1

A [implementação W1](docs/reports/REPORT-SUPPORT-SEED-W1-20260928-193318.md)
remove o bloqueio operacional da seed nesta branch e foi provada em bancos
descartáveis próprios. Nenhum drift funcional RF01–RF13 foi introduzido;
revisão independente e integração continuam pendentes. Não há deploy. O
bloco seguinte preserva a decisão documental anterior.

## Definição operacional W1 aprovada

A [decisão W1](docs/reports/REPORT-SUPPORT-SEED-W1-DEFINITION-20260928-184122.md)
fecha o blocker de escopo e congela a fixture do domínio completo,
volumes 6/16/44/80 e gates de execução descartável. A pendência local é
agora implementação/prova da seed, sem novo drift funcional RF01–RF13.
`scripts/seed.ts` permanece bloqueado; não houve execução ou deploy.

## Fotografia histórica — checkpoint operacional W1

O [report da seed W1](docs/reports/REPORT-SUPPORT-SEED-W1-CHECKPOINT-20260928-182459.md)
classifica a pendência como definição operacional bloqueada pela escolha
Department-only versus domínio completo. Não é drift novo das RF01–RF13.
`scripts/seed.ts` continua indisponível e não foi executado.

## Estado corrente — MAIN_BASELINE_RF13

RF01–RF13 estão implementadas, provadas e integradas em `main` no merge
funcional `2aacc5554c9c2c4f25415dd8b170f5ff73b6d189` da PR #15. A CI
`ci / quality` do head `2741f0e` passou no run `36456698983`. Support 0.15
permanece fixo no gitlink `14efcdfdc70d774c4343e2ec47662b7b5c8b691b`.
O inventário abaixo contém um drift histórico fechado,
`DRIFT-SUP-S1-001`, e nenhum drift técnico funcional aberto identificado nas
RFs implementadas. Os blockers contratuais RF13 eram históricos e foram
resolvidos antes da implementação. O [report final](docs/reports/REPORT-SUPPORT-FINAL-CLOSURE-20260928-174429.md)
registra as evidências e limites.

A seed de domínio permanecia indisponível até a definição da massa
determinística W1 naquela fotografia; era pendência operacional local separada das RFs. Deploy,
ambiente e aceitação de produção não foram provados. NFRs de BFF/plataforma
ou de mensageria não contratada não são promovidos automaticamente a drift
local. As seções seguintes são fotografias históricas, inclusive afirmações
anteriores de RF13 ausente e de CI remota pendente.

## Fotografia histórica — revisão independente RF13

A [revisão local RF13](docs/reports/REPORT-SUPPORT-RF13-REVIEW-20260928.md)
não encontrou vazamento de auditorias, bypass de ACL ou divergência com Support
0.15. Duas lacunas no harness de prova foram fechadas; runtime, schema,
gitlink e documentação canônica ficaram inalterados. Não houve publicação Git.
Os registros abaixo preservam os estados anteriores.

## RF13 — implementação focal sem drift novo identificado

O contrato Support 0.15 está materializado na branch funcional: ACL e escopo
de auditoria no SQL, resposta paginada, snapshot PostgreSQL e documentação
HTTP. Nenhuma correlação heurística com TicketMessage, migration ou evento foi
introduzido. A prova local e seus limites constam no
[report RF13](docs/reports/REPORT-SUPPORT-RF13-20260928.md). A integração em
`main` e a CI remota ainda dependem de lote posterior. Os registros abaixo
são históricos.

## RF13 — contrato 0.15 congelado, sem drift técnico novo

Os blockers documentais RF13 foram fechados somente para esta rota em Support
0.15 (`14efcdf`), publicado e fixado no gitlink. `/tickets/history` ainda
retorna 404 por estágio; OpenAPI, `api.http`, runtime e testes RF13 não foram
alterados. A ausência é esperada e não é drift de `MAIN_BASELINE_RF12`.
Nenhuma migration ou evento foi introduzido. Ver
[report RF13](docs/reports/REPORT-SUPPORT-RF13-CONTRACT-20260928-141233.md).
As seções seguintes são históricas.

## RF13 — decisão de visibilidade sem drift técnico novo

A política de `nova_mensagem` para admin/requester foi decidida e registrada
no [report RF13](docs/reports/REPORT-SUPPORT-RF13-VISIBILITY-20260925-203223.md).
Não há alteração de schema nem runtime. Os demais blockers contratuais seguem
abertos; a reserva 404 é esperada e não é drift da baseline RF12. Support 0.14
continua fixo. O checkpoint anterior permanece histórico abaixo.

## RF13 — checkpoint contratual, sem drift técnico novo

RF12 foi integrada pela PR #14 em `1e243d3`, com CI aprovada. A ausência da
rota funcional RF13 é esperada: `/history` está reservado em 404 enquanto
`DEC-SUP-01/02/04/08/09` permanecem abertas para esta RF. Não há evidência de
regressão técnica RF12 nem contrato Support 0.15 congelado. O
[checkpoint RF13](docs/reports/REPORT-SUPPORT-RF13-CHECKPOINT-20260925-195255.md)
registra a lacuna de visibilidade de `nova_mensagem` sem classificá-la como
defeito do runtime existente. Os blocos seguintes são históricos.

## RF12 — implementação focal sem drift técnico aberto

A ausência esperada da rota GET no checkpoint documental foi fechada somente
nesta branch funcional. Runtime, OpenAPI, `api.http`, testes, prova PostgreSQL,
CI e documentação local foram alinhados ao contrato Support 0.14; nenhum drift
novo foi identificado no recorte. `main` continua em RF11 e RF13 não foi
implementada. [Prova RF12](docs/reports/REPORT-SUPPORT-RF12-20260925.md).
As seções seguintes preservam o estado documental anterior.

## RF12 — contrato 0.14 congelado, sem drift técnico novo

As lacunas de visibilidade, paginação, resposta e leitura concorrente foram
fechadas por decisão expressa somente para RF12 em Support 0.14 (`820b2a8`),
publicado e fixado no gitlink. A ausência da rota GET RF12 no runtime/OpenAPI
continua esperada no lote documental: `RF12_CONTRACT_FROZEN /
NOT_IMPLEMENTED`. Não há migration nova nem drift técnico novo identificado.
[Fechamento RF12](docs/reports/REPORT-SUPPORT-RF12-CONTRACT-20260925-185019.md).

## Fotografia histórica — RF12 bloqueada por decisão

O PRD prevê `GET /api/support/tickets/{ticketId}/messages`, ainda ausente do
runtime e da OpenAPI por estágio. O bloqueio atual é contratual: a política de
`isVisibleToRequester` por papel, inclusive filtro omitido/`false` e `total`,
permanece sem decisão RF12. Paginação detalhada, ordem, shape e erros também
não estão congelados. Não classificar ausência esperada da rota como regressão
de `MAIN_BASELINE_RF11`. Support 0.13 e seu gitlink foram preservados; nenhum
drift técnico novo foi identificado no recorte documental.
[Report RF12](docs/reports/REPORT-SUPPORT-RF12-CHECKPOINT-20260925-182925.md).

## RF11 integrada em MAIN_BASELINE_RF11

A rota RF11, contrato HTTP, testes e prova PostgreSQL foram adicionados na
branch funcional sobre Support 0.13 e integrados pela PR #12 no merge
`9387b3d`. O check `ci / quality` passou no run `36169743450`.
A prova física do no-op, rollback e
concorrência não identificou drift técnico novo no recorte RF11. RF12/RF13
permanecem ausentes. [Report de implementação](docs/reports/REPORT-SUPPORT-RF11-20260925.md).

## Fotografia histórica — RF11 contrato 0.13 congelado, sem runtime

As lacunas do checkpoint RF11 foram fechadas por decisão expressa específica
em Support 0.13 (`4958fd1`), publicado no repositório canônico. O gitlink
daquela revisão apontava a essa versão. A ausência da rota era esperada:
`RF11_CONTRACT_FROZEN / NOT_IMPLEMENTED`, sem drift técnico novo atribuído ao
runtime RF01–RF10. O checkpoint bloqueado `85b3adb` e o relatório anterior
são históricos. [Fechamento RF11](docs/reports/REPORT-SUPPORT-RF11-CONTRACT-20260925-165105.md).

## Fotografia histórica — checkpoint RF11 com lacuna contratual

O checkpoint RF11 sobre `MAIN_BASELINE_RF10` está
`RF11_CONTRACT_CHECKPOINT_BLOCKED_BY_DECISION` naquela fotografia. O PRD original não resolve a
política de alteração de visibilidade por tipo/autoria de mensagem nem os
efeitos e respostas da operação. A ausência da rota RF11, inclusive o `404`
esperado nas provas históricas, é coerente com `NOT_IMPLEMENTED`; não é
regressão da RF10. Naquela fotografia, Support 0.12 e o gitlink `85c7e95`
permaneciam fixados.
Detalhes em
[REPORT-SUPPORT-RF11-CHECKPOINT-20260925-161025.md](docs/reports/REPORT-SUPPORT-RF11-CHECKPOINT-20260925-161025.md).

## RF10 integrada em MAIN_BASELINE_RF10

RF10 foi implementada e provada em `feat/support-rf10-create-message` sobre o
contrato Support 0.12, e integrada pela PR #10 no merge `8827c0b`. O check
remoto `ci / quality` passou no run `36156561044`. A migration RF05 suporta `type=admin`, mídias
posicionais e as duas auditorias; não surgiu drift de schema nem foi criada
migration nova. Os quatro fault injections RF10 reverteram mensagem, mídia,
Ticket e auditorias; as quatro concorrências terminaram sem lost update ou
deadlock. O primeiro comando de cobertura encontrou `listen EPERM` no sandbox;
repetido com bind local permitido, passou. A primeira prova RF10 teve erro de
cleanup de processo já encerrado, corrigido e repetido com exit 0 e descarte do
banco. O primeiro replay RF02 usou fuso local e falhou na comparação histórica
de timestamp; com `TZ=UTC`, RF02–RF09 passaram. Nenhum drift técnico novo fica
aberto no recorte RF10.

As seções abaixo preservam fotografias dos checkpoints anteriores.

## Drift encerrado

| ID                                                                     | Estado            | Impacto                                                                 | Próxima ação                             |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| [DRIFT-SUP-S1-001](.codex/drifts/DRIFT-SUP-S1-001-dist-entrypoints.md) | RESOLVED / PROVEN | Build emite os entrypoints declarados; gates e provas isoladas passaram | Não reabrir sem nova reprodução objetiva |

O estado global permanece `BOOTSTRAP_IMPLEMENTED_AND_PROVEN`. A correção e as
provas históricas estão no
[report S1](docs/reports/REPORT-SUPPORT-S1-CLOSURE-20260910-163634.md).

## Fotografia histórica — escopo anterior RF11

RF01–RF11 estão `IMPLEMENTED_AND_PROVEN` em `main`, na baseline
`MAIN_BASELINE_RF11` (merge da PR #12 `9387b3dc6e636db4b8124785e7b3bc92ec46d054`).
As decisões foram fechadas apenas em cada recorte; RF07a/RF07b têm contrato
Support 0.9 congelado e runtime implementado/provado na PR #7. RF08 foi
integrada pela PR #8; RF09 foi integrada pela PR #9; RF10 pela PR #10 e RF11
pela PR #12. RF12/RF13 permanecem fora do runtime. O checkpoint RF10 bloqueado
é histórico; decisões posteriores
congelaram Support 0.12 em `85c7e95`, sem novo drift técnico identificado. O
checkpoint RF08 bloqueado era uma lacuna contratual; decisões posteriores a
fecharam em Support 0.10, sem drift técnico novo do runtime existente.

Não há drift técnico aberto conhecido em S1/RF01–RF06. O checkpoint RF03
inicialmente registrou uma lacuna contratual, não um defeito de runtime; ela foi
fechada antes da implementação. As provas não reproduziram regressão: RF01 e
RF02 passaram novamente em PostgreSQL real. No lote RF04, RF01–RF03 passaram
novamente e RF05–RF13 permaneceram `404`.

## Continuidade

O merge `0387167cfe02416c5d05cf3b8288350dd5ba682b` define
`MAIN_BASELINE_RF06`; a PR #5 e sua CI estão concluídas. O checkpoint RF07a/RF07b
registrou lacunas contratuais históricas, resolvidas para RF07a/RF07b em
Support 0.9. A PR documental #6 foi integrada no merge `939b991`; o gitlink da
PR #7 aponta para `1583a586793437a7b7c0569581637ee8ddac5ae5`. A prova
funcional RF07 passou em PostgreSQL 16 com banco exclusivo descartado pelo script.
O checkpoint RF08 bloqueado no commit `a8714a8` permanece histórico. As decisões
de body, response, no-op, auditoria, identidade e concorrência foram registradas
no contrato canônico Support 0.10, publicado em `93edf66d6ed0002a2af537339da315db1285a779`.
O gitlink desta branch aponta a essa revisão. O checkpoint documental
`RF08_CONTRACT_CHECKPOINT_READY / RF08_CONTRACT_FROZEN` permanece válido.
A branch funcional implementou RF08 sem alterar o contrato ou criar migration.
A prova PostgreSQL 16 descartável passou após alinhamento UTC do cliente de
prova, incluindo rollback de AuditLog e concorrência RF08×RF08/RF06×RF08.
Nenhum drift técnico novo foi identificado. O checkpoint RF09 em
`docs/reports/REPORT-SUPPORT-RF09-CHECKPOINT-20260924-223334.md` registra
DEC-SUP-01/08/09 então abertas; a aprovação posterior as fechou somente para
RF09 em Support 0.11 (`a198b46`). A primeira tentativa de publicação remota
foi bloqueada pela revisão automática; depois de autorização específica,
o SHA canônico e a branch do serviço foram publicados e conferidos. Não há
drift técnico novo do runtime naquele checkpoint; RF09–RF13 ainda estavam
ausentes naquela fotografia anterior à branch funcional.

## RF09 integrada e RF10 documental

Contrato Support 0.11 preservado historicamente; gitlink avançado para Support
0.12 `85c7e95` após publicação canônica. A prova PostgreSQL 16 com banco próprio
descartado, suíte HTTP/SQLite, contrato e smoke da imagem não
reproduziram drift técnico. A falha inicial da prova histórica RF02 sob fuso
local foi de interpretação de timestamp pelo cliente de prova; o replay com
`TZ=UTC` passou. A PR #9 foi integrada em `393af3e` após CI `quality` aprovada
no run `36145983860`. O checkpoint RF10 bloqueado documenta decisões então
abertas; elas foram resolvidas somente para RF10 em Support 0.12. A ausência de
rota RF10 é esperada, não drift técnico da baseline RF09. Nenhum teste RF10 foi
executado no fechamento documental.
