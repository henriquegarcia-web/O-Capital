# Regras de Desenvolvimento

Estas regras devem orientar qualquer alteracao, melhoria ou implementacao neste projeto.

1. Novas funcionalidades devem ser implementadas de forma componentizada e escalavel. Componentes ficam em `components`, logicas Firebase em `firebase` ou `api`, regras reutilizaveis em `hooks` ou `utils`, tipagens em `types` e schemas em `schemas`.
2. Formatadores e validadores devem ser centralizados em `src/utils`. Dados devem ser salvos no banco sem formatacao e exibidos formatados. Formularios devem aplicar formatacao e validacao adequadas.
3. Todo componente ou pagina deve seguir o formato `Pasta/index.tsx`.
4. Layout e UI devem priorizar Ant Design. Use `Layout`, `Flex`, `Space`, `Grid`, `Card`, `Form` e componentes especificos do Ant antes de criar estruturas manuais.
5. Imports internos devem usar o alias `@/...`, exceto imports entre arquivos da mesma pasta, onde `./` e permitido.
6. Componentes reutilizaveis de formulario devem ficar em `src/components/forms`, integrando Ant Design, `Controller` do `react-hook-form` e schemas `zod` quando aplicavel.
7. Exports agregados devem ser mantidos em `src/components/ui/index.ts`, `src/components/forms/index.ts` e `src/pages/index.ts`.
