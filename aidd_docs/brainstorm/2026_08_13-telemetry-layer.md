# Couche de télémétrie AIDD

> Brainstorm — 2026-08-13. Cohérence d'ensemble, niveau intention. Pas de plan ni de code.
> Cadre : jalon [#14 « Prove what an AI session costs »](https://github.com/ai-driven-dev/framework/milestone/14), échéance 2026-08-21, trois issues ouvertes (#617, #618, #620).

## L'idée

Répondre à une seule question : **combien a coûté cette feature, et où est parti l'argent dans le cycle de vie**. Les fournisseurs savent dire « ce dev a brûlé X tokens mardi ». Aucun ne sait dire « la story 428 a coûté Y, dont 60 % en phase de spécification ». L'écart entre les deux, c'est exactement ce que le framework possède et qu'eux n'ont pas : la tâche, la phase, la skill, le geste.

La couche de télémétrie n'est donc pas un collecteur. C'est une **jointure**. Le framework n'a pas à mesurer les tokens : les outils le font déjà, mieux, et à la source. Il a à produire l'identifiant qui permet de rattacher leur mesure à son propre découpage du travail, et à garantir que cet identifiant survit au commit, au squash, au worktree parallèle et à la session qui ne produit rien.

## Faits qui cadrent la décision

Convention de marquage, reprise de #618 : `[v]` = lu dans la source officielle à la date indiquée, avec la citation reportée en annexe. `[?]` = non vérifié, ou non vérifiable depuis cet environnement. Une cellule `[?]` reste `[?]` et n'est jamais comblée par une valeur plausible. Passe du 2026-08-13, sources listées en fin de document.

### Ce que chaque outil expose réellement

| Outil | Export OTel natif | Tokens | Identifiant de session dans l'export | Coût | Tokens dans un hook |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `[v]` métriques, logs, traces (bêta) | `[v]` `claude_code.token.usage`, unité `tokens` | `[v]` `session.id`, **sur chaque point de métrique et chaque enregistrement d'événement**, réglable par `OTEL_METRICS_INCLUDE_SESSION_ID` (défaut `true`) | `[v]` `claude_code.cost.usage`, unité USD | `[v]` non pour la session ; une exception étroite documentée, voir plus bas |
| Codex CLI | `[v]` (source) exportateurs séparés logs / traces / métriques via `[otel]` | `[v]` (source) métrique `codex.turn.token_usage` | `[v]` (source) `conversation_id` porté par `SessionTelemetry` sur les événements ; **absent des tags de métrique**, qui sont exactement six | `[?]` aucune métrique de coût dans la liste des noms | `[?]` payload des hooks non vérifiable, doc bloquée |
| GitHub Copilot | `[v]` traces et métriques, `otlp-http` ou fichier, activé par `COPILOT_OTEL_ENABLED=true` ou par `OTEL_EXPORTER_OTLP_ENDPOINT` | `[v]` `gen_ai.usage.input_tokens`, `.output_tokens`, `.cache_read.input_tokens`, `.cache_creation.input_tokens` sur les spans `invoke_agent` et `chat` | `[v]` `gen_ai.conversation.id`, décrit « Session identifier », **sur les spans** ; `[?]` non documenté comme dimension de métrique | `[v]` `github.copilot.cost` (« Monetary cost ») et `github.copilot.aiu` en attribut de span ; devise non précisée | `[v]` non — aucun champ de token, d'usage ou de coût dans les payloads de hook |
| Cursor | `[?]` | `[?]` | `[?]` | `[?]` | `[?]` |
| OpenCode | `[v]` aucun — zéro occurrence de « otel », « opentelemetry », « otlp » ou « telemetry » dans les pages plugins, config, cli et server | `[?]` hors export | sans objet | `[?]` hors export | `[v]` non — aucun des événements de plugin listés n'expose d'usage |

**Cursor est un trou de connaissance, pas une absence de fonctionnalité.** `cursor.com`, `docs.cursor.com` et `cursor.sh` sont refusés par la politique de sortie réseau de cette session (403 côté proxy, y compris via l'outil de récupération de page), et Cursor ne publie pas de miroir de documentation sur un hôte accessible. Aucune décision ne doit s'appuyer sur cette ligne. Il faut soit débloquer le domaine, soit qu'un humain ouvre la page.

**Codex est vérifié sur son code source, pas sur sa documentation.** `developers.openai.com` est refusé par la même politique, et `docs/config.md` du dépôt n'est plus qu'une redirection vers cet hôte. Ce qui est marqué `[v]` (source) ci-dessus vient de `codex-rs/otel/`, qui est le code effectivement exécuté — donc plus fiable qu'une documentation, mais sans garantie de stabilité d'interface.

### Trois conséquences qui décident de l'architecture

- **Aucun hook n'expose la consommation de la session.** Vérifié sur Claude Code, Copilot et OpenCode ; non vérifiable sur Codex et Cursor. Une exception étroite et documentée existe sur Claude Code : le `PostToolUse` d'un appel d'agent au premier plan reçoit `totalTokens` et `usage` dans `tool_response` — mais la documentation précise que ces champs « cover the final request only » et renvoie explicitement aux compteurs de métriques pour tout cumul. Un journal de tokens écrit par les hooks reste donc structurellement faux, et l'exception ne le sauve pas.
- **Le type de signal qui porte la jointure diffère par outil** : métriques et événements chez Claude Code, événements chez Codex, spans chez Copilot. Un collecteur qui n'ingère que les métriques donnera une réponse juste pour Claude Code et vide pour les autres, sans erreur visible.
- **Aucun des outils ne documente que l'identifiant vu par un hook est celui de son export.** Claude Code nomme `session_id` le champ commun des payloads de hook et `session.id` l'attribut de télémétrie ; rien n'affirme que c'est la même valeur. C'est l'hypothèse porteuse de tout l'édifice et elle n'est adossée à rien.

### Ce que le dépôt a déjà tranché

- Standard OpenTelemetry, puits = collecteur OTel, pas de SaaS (#297, décision de fond).
- Opt-in explicite, jamais de contenu de prompt ni de code, identifiants anonymisés (#297).
- Désactivé par défaut sur les dépôts publics, opt-in par dépôt (#617, #620).
- Le nom de dossier de tâche `aidd_docs/tasks/<mois>/<date>_<slug>/` est déjà l'identifiant de la feature : daté, unique, greppable, créé avant la première ligne de code.
- La CLI possède l'installation et la vérification du pipeline ; une skill ne peut pas en être responsable, parce qu'elle doit s'en souvenir et qu'elle ne connaît pas de façon fiable son propre identifiant de session (#617).
- Le kanban lit et ne produit rien ; sa fiche produit déclare explicitement « journal des exécutions » et « tokens par phase » comme manquants, à demander à qui possède le pipeline d'exécution.

## La forme retenue

**Trois producteurs, un point de jointure, deux consommateurs.**

```mermaid
flowchart TB
  subgraph P["Producteurs"]
    V["Outil hôte<br/>export OTel natif<br/>tokens, coût, id fournisseur"]
    H["Hooks AIDD<br/>run_id, task_id, phase, skill<br/>aucun token"]
    G["Commit / PR<br/>trailer AIDD-Session-Id"]
  end

  V --> COL["Collecteur OTel<br/>puis stockage"]
  H --> LED["sessions/&lt;run_id&gt;.json<br/>dans le dossier de tâche"]
  G --> GIT["Historique git"]

  LED -- "run_id ↔ native_id" --> J{{"Jointure"}}
  COL --> J
  GIT --> J

  J --> K["kanban<br/>local, hors ligne<br/>où j'en suis, quoi lancer"]
  J --> D["gouvernail<br/>coût par tâche, phase, équipe"]

  K -. "sans tokens : ils ne sont pas sur disque" .-> K
```

### 1. Le framework ne collecte pas les tokens, il les fait émettre et les rejoint

La CLI configure l'export natif de chaque outil (variables d'environnement pour Claude Code et Copilot, table `[otel]` du `config.toml` pour Codex) vers un collecteur choisi par le projet. Elle n'écrit pas de collecteur maison. Le corollaire est que la couche AIDD n'a aucun chemin réseau au moment du commit, donc rien qui puisse bloquer ou ralentir.

### 2. Le framework possède son propre identifiant, et le fait vivre à côté de celui du fournisseur

Un `run_id` engendré par AIDD au démarrage de session, stocké avec l'identifiant natif **et son espèce**, parce que les quatre outils supportés nomment la chose de quatre façons. L'attribution tâche → exécution ne doit alors rien à un fournisseur ; seule la jointure de coût reste empruntée, et reste explicite. C'est déjà la position de #620 et elle tient.

### 3. Deux façons de tenir la jointure — un arbitrage qui n'est écrit nulle part

| | A. Table de correspondance (position actuelle de #620) | B. Injection dans l'export |
| --- | --- | --- |
| Mécanisme | le hook de démarrage écrit `run_id` ↔ `native_id` sur disque ; l'aval joint sur l'id natif | poser `OTEL_RESOURCE_ATTRIBUTES=aidd.run_id=…` avant le démarrage ; le `run_id` est **dans** la télémétrie, aucune jointure |
| Dépend de | l'égalité entre l'id du hook et l'id de l'export — non documentée nulle part | de pouvoir fixer une variable d'environnement avant le démarrage du processus |
| Portée vérifiée | les outils qui exposent un id dans leurs hooks | `[v]` Claude Code : « attaches these values as attributes on every metric datapoint and event record ». `[v]` Copilot : `OTEL_RESOURCE_ATTRIBUTES` documenté. `[v]` Codex (source) : `[otel.span_attributes]` s'applique aux **spans** seulement, donc pas aux événements qui portent les tokens |
| Coût | une jointure de plus, et une hypothèse à re-vérifier à chaque version d'outil | la variable doit exister avant le processus, ce qui n'est pas le cas d'un identifiant engendré par un hook de démarrage |

Deux précisions vérifiées changent l'arbitrage.

- **La moitié statique de B est gratuite, aujourd'hui, sans lanceur.** Claude Code lit un bloc `env` de `settings.json` « applied to every session », donc `aidd.project_id`, le dépôt ou l'équipe entrent dans la télémétrie par simple fichier de configuration posé par la CLI. Cela couvre déjà la découpe par projet et par équipe.
- **La moitié par session ne l'est pas.** Un `run_id` change à chaque session, alors qu'un fichier de configuration est statique et qu'une variable d'environnement est figée au démarrage du processus. L'obtenir suppose que quelque chose lance l'outil — la documentation de Claude Code nomme d'ailleurs le « launch wrapper » comme la façon d'attacher une identité par utilisateur. C'est un changement de nature pour la CLI, qui installe aujourd'hui et ne lance pas.

Les deux voies ne s'excluent donc pas, et l'arbitrage n'est pas « A ou B » mais **A comme socle, B statique tout de suite, B par session seulement si un lanceur est décidé**. A reste nécessaire quoi qu'il arrive : un attribut de ressource est figé au démarrage alors que la phase et la tâche changent en cours de session, donc les intervalles ne peuvent pas y vivre.

### 4. Le fichier de métadonnées : deux fichiers, pas un

L'intention d'un fichier de métadonnées dans le dossier de tâche est juste, mais elle recouvre deux objets dont les propriétés d'écriture sont opposées.

| | Identité de la tâche | Journal des sessions |
| --- | --- | --- |
| Contenu | type (feature, bug, spike), ticket d'origine, spec, plan, epic / story | `run_id`, `native_id` et son espèce, outil, `parent_run_id`, intervalles phase / date |
| Écrivain | une skill, au moment du cadrage | un hook, à chaque démarrage et à chaque fin de tour |
| Fréquence | quelques écritures sur la vie de la tâche | continue, concurrente, potentiellement depuis plusieurs worktrees |
| Conflit de fusion | possible, et résoluble par un humain | structurellement impossible **si et seulement si** un fichier par session |

Les mettre dans un même fichier réintroduit le conflit de fusion que le découpage un-fichier-par-session de #620 avait précisément éliminé. Ils restent séparés.

Sur l'identité de la tâche, la position minimale se défend mieux que le nouveau fichier : **le dossier est déjà l'identifiant**, et `plan.md` porte déjà un frontmatter que le kanban lit. Ajouter un `metadata.json` crée une deuxième source de vérité à synchroniser avec le frontmatter, pour un gain limité au parsing. Le format JSON ne se justifie que le jour où un écrivain machine touche ce fichier — ce qui n'est pas prévu. Recommandation : étendre le frontmatter existant, n'introduire comme nouveauté que le répertoire `sessions/`. À trancher, c'est une décision produit et pas technique.

### 5. Cardinalité : les identifiants ne montent pas sur les métriques

`run_id`, `task_id` et `session.id` sont non bornés. Posés en attributs de métrique, ils font exploser la cardinalité du stockage. Ce n'est pas une précaution théorique : les deux fournisseurs vérifiables le disent ou le codent.

- Claude Code documente le risque et fournit l'échappatoire : « Each custom key becomes a label on every metric series, so high-cardinality values increase storage cost in your metrics backend », avec `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES=false` pour n'envoyer les attributs personnalisés que dans le bloc de ressource.
- Codex borne ses tags dans le code : six tags de métrique exactement, et une fonction dédiée qui replie tout `originator` inconnu sur la valeur `other` pour rester à faible cardinalité.

La règle qui en découle : les identifiants vivent sur les logs et les spans, les métriques restent à faible cardinalité, la jointure se fait au moment de la requête. Claude Code, qui met `session.id` sur ses points de métrique, est l'exception commode et non le modèle — et c'est précisément l'exception qu'un réglage peut retirer, ce que le `status` de #617 prévoit déjà de détecter.

### 6. Répartition entre les deux consommateurs

Elle découle du support, pas d'un choix : **le kanban lit des fichiers locaux, donc il ne verra jamais de tokens** — ils ne sont pas sur le disque. Il montre les sessions, les intervalles, la phase en cours, le prochain geste. **Le gouvernail lit le stockage de télémétrie et le dépôt**, donc lui seul peut calculer un coût par tâche, par phase, par personne. Le journal de sessions lu depuis le dépôt lui donne au passage une seconde source, indépendante du flux OTel, qui doit se réconcilier avec lui : une divergence devient un signal d'intégrité au lieu d'un mystère.

## Contraintes non négociables

- **Échouer ouvert.** Un hook de télémétrie qui plante, expire ou ne trouve rien sort en `0` et se tait. Il ne bloque, ne retarde et ne modifie jamais un commit. Sur Copilot, un `preToolUse` qui sort non-zéro **refuse l'appel d'outil** : la sémantique d'échec est par outil et se vérifie avant écriture.
- **Aucun contenu ne quitte la machine.** Ni prompt, ni code, ni diff. Le trailer porte un identifiant opaque et rien d'autre. Le risque de fuite ne vient pas d'AIDD mais de l'utilisateur qui active `OTEL_LOG_USER_PROMPTS` chez le fournisseur ; la CLI doit le détecter et le dire, pas l'ignorer.
- **Une installation complète qui ne produit rien doit se lire comme cassée.** C'est la ligne utile du `status` de #617 : hooks posés, export configuré, et malgré tout `session.id` absent parce que `OTEL_METRICS_INCLUDE_SESSION_ID=false`. La part de commits estampillés sur sept jours est le seul contrôle qui prouve que le pipeline produit de la donnée plutôt qu'il existe.
- **Une session qui ne produit aucun commit doit rester comptée.** Planifier, explorer, déboguer, répondre à une revue : ce sont les sessions les plus chères et elles ne commitent pas. Une attribution fondée sur les seuls commits sous-compte, et sous-compte le plus là où le chiffre doit être juste.

## Incohérences et manques repérés dans le jalon

- **#617 se contredit avec lui-même.** La section « Scope » fait écrire au marqueur `PreToolUse` « the `session_id` from the event payload », alors que la décision du 2026-08-12 pose que le trailer porte le `run_id` AIDD et non un identifiant fournisseur. Deux valeurs différentes pour un même trailer.
- **#617 dépend de #620 et aucune des deux ne le dit.** Le `run_id` que le trailer transporte est engendré par le mécanisme de #620. Les relations déclarées des deux issues ne portent que `blocked-by #585`. Dans l'ordre du jalon, #620 passe avant #617.
- **Personne ne possède la configuration de l'export fournisseur.** #617 mentionne « optional OTLP endpoint » dans le bloc de configuration, mais poser les variables et les blocs par outil, et vérifier qu'ils sont actifs, n'est le périmètre déclaré d'aucune des trois issues. Sans cela le jalon produit des identifiants qui ne joignent rien.
- **Personne ne possède le puits.** Collecteur, stockage, rétention : hors périmètre des trois issues, et #297 le porte encore à l'état d'intention.
- **L'émission des événements de phase et de skill est explicitement remise à plus tard** par #617. C'est pourtant la seule chose que le framework sait et que les fournisseurs ignorent, donc la seule raison d'exister de la couche. À planifier tôt, sinon le jalon livre une jointure sans le contenu qui la rend intéressante.
- **OpenCode n'a aucun chemin.** Ni export, ni identifiant dans le contexte de plugin, ni usage dans les événements. Le dire dans `status` comme le prévoit #617 est la bonne réponse ; toute autre voie serait de la rétro-ingénierie à maintenir.
- **Deux fournisseurs sur cinq sont hors de portée de vérification** depuis cet environnement, Cursor entièrement et Codex pour sa documentation. #618 pose la bonne règle pour ce cas ; encore faut-il que quelqu'un dispose d'un accès réseau qui permette de l'appliquer. C'est une dépendance d'outillage du jalon, pas un détail.

## Ce que le PRD proposé change, et pourquoi il ne tient pas tel quel

Le PRD reçu décrit une collecte maison : hooks qui écrivent un `runtime.jsonl` global par utilisateur, démon de lecture, envoi vers un SaaS. Trois raisons de ne pas partir là-dessus.

- **Les hooks ne portent pas la consommation de la session.** Le `runtime.jsonl` de F1/F2 ne peut structurellement pas contenir la mesure qui est l'objet du produit. La seule exception vérifiée, les tokens de la dernière requête d'un sous-agent Claude Code, est explicitement présentée par le fournisseur comme non cumulable.
- **Le SaaS contredit une décision de fond du dépôt** (#297 : puits OTel, pas de SaaS). Le débat peut se rouvrir, mais alors explicitement et pas par un document parallèle.
- **Recollecter ce que les fournisseurs exportent déjà** achète de la dette pour une donnée de moins bonne qualité, alors que la valeur propre du framework est ailleurs : la phase, la skill, la tâche.

Ce que le PRD apporte et qu'il faut garder : la vue locale pour le développeur, la rétention bornée, et le fait de poser la question de la facturation. Reformulé sur l'architecture ci-dessus, `runtime.jsonl` devient un cache local du flux OTel, pas une source concurrente.

## Assumptions ouvertes

- **L'identifiant vu par un hook est-il celui de l'export ?** Aucune documentation ne l'affirme, sur aucun des outils vérifiables. Tout repose dessus. Se vérifie empiriquement en une session par outil, et une documentation ne suffira pas : c'est une propriété d'exécution.
- **Un sous-agent propage-t-il le `session_id` du parent ?** Si un commit part d'un sous-agent avec son propre identifiant, une part du coût se détache de la feature.
- **L'identifiant survit-il à une reprise, un `clear`, une compaction, un fork ?** Aucun des cinq ne le documente (#618).
- **Le lanceur de B existe-t-il, et le voulons-nous ?** Aujourd'hui la CLI installe, elle ne lance pas. C'est un changement de nature.
- **Où vit le puits par défaut** pour un utilisateur solo qui ne veut pas monter un collecteur, et comment il obtient une vue sans rien exposer.
- **Ce que la vue locale doit montrer** au minimum pour valoir le déplacement, sachant qu'elle ne peut pas montrer de tokens sans le puits.

## Prochaine étape

Un **spike d'égalité d'identifiants**, avant toute écriture de code : une session réelle par outil, l'identifiant vu par le hook et le `session.id` de l'export relevés côte à côte et consignés. C'est déjà le troisième critère d'acceptation de #617, mais il y est traité comme une case à cocher en fin de parcours alors qu'il est l'hypothèse qui décide de la forme. S'il tombe, la voie B cesse d'être un durcissement et devient l'unique chemin.

Ensuite, dans cet ordre : #618 (les faits, dont dépendent les deux autres), #620 (le journal, qui engendre le `run_id`), #617 (le trailer, qui le transporte). Et une décision explicite sur qui possède la configuration de l'export fournisseur, faute de quoi le jalon livre une jointure sans rien à joindre.

## Sources

Passe de vérification du 2026-08-13. Chaque page a été lue en entier ou parcourue par recherche sur les termes décisifs. Une affirmation marquée `[v]` plus haut renvoie à une de ces lignes.

| Source | Ce qu'elle établit |
| --- | --- |
| `https://code.claude.com/docs/en/monitoring-usage.md` | `session.id` sur les métriques et les événements, réglé par `OTEL_METRICS_INCLUDE_SESSION_ID` (défaut `true`) ; `claude_code.token.usage` (tokens) et `claude_code.cost.usage` (USD) ; `OTEL_RESOURCE_ATTRIBUTES` « attaches these values as attributes on every metric datapoint and event record » ; avertissement de cardinalité et `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES=false` ; « launch wrapper » nommé comme la voie d'attachement d'identité par utilisateur |
| `https://code.claude.com/docs/en/hooks.md` | `session_id` en champ commun des payloads ; aucun champ d'usage sur `Stop`, `SubagentStop` ou `SessionEnd` ; `PostToolUse` d'un appel d'agent au premier plan porte `totalTokens` et `usage`, « cover the final request only » |
| `https://code.claude.com/docs/en/settings.md` | Bloc `env` « applied to every session and to subprocesses », donc injection statique possible sans lanceur |
| `https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/copilot-cli-reference/cli-command-reference.md` | Source de rendu de `docs.github.com`. Activation par `COPILOT_OTEL_ENABLED` ou `OTEL_EXPORTER_OTLP_ENDPOINT` ; `OTEL_RESOURCE_ATTRIBUTES` supporté ; `gen_ai.conversation.id` « Session identifier » sur `invoke_agent` et `chat` ; `gen_ai.usage.*` sur les spans ; `github.copilot.cost` « Monetary cost » et `github.copilot.aiu` ; métrique `gen_ai.client.token.usage` « by type (input/output) », sans dimension de conversation |
| `https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/hooks-reference.md` | `sessionId` sur chaque événement de hook ; aucun champ de token, d'usage ou de coût dans aucun payload |
| `https://raw.githubusercontent.com/github/copilot-sdk/main/docs/observability/opentelemetry.md` | `TelemetryConfig` du SDK (`otlpEndpoint`, `exporterType`, `captureContent`), propagation W3C ; renvoie à l'événement `assistant.usage` pour l'attribution de coût |
| `https://raw.githubusercontent.com/openai/codex/main/codex-rs/otel/README.md` | Exportateurs séparés logs / traces / métriques ; `[otel.span_attributes]` « applied to exported trace spans and propagated trace context », donc pas aux événements |
| `https://raw.githubusercontent.com/openai/codex/main/codex-rs/otel/src/metrics/names.rs` | `codex.turn.token_usage`, `codex.sse_event`, `codex.api_request` et le reste des noms de métrique ; aucune métrique de coût |
| `https://raw.githubusercontent.com/openai/codex/main/codex-rs/otel/src/metrics/tags.rs` | Six tags de métrique exactement (`app.version`, `auth_mode`, `model`, `originator`, `service_name`, `session_source`), sans identifiant de conversation ; repli sur `other` pour borner la cardinalité |
| `https://raw.githubusercontent.com/openai/codex/main/codex-rs/otel/src/events/session_telemetry.rs` | `conversation_id` porté par `SessionTelemetry` sur les événements |
| `https://raw.githubusercontent.com/sst/opencode/dev/packages/web/src/content/docs/{plugins,config,cli,server}.mdx` | Zéro occurrence de « otel », « opentelemetry », « otlp », « telemetry » ; catalogue complet des événements de plugin, sans champ d'usage |

### Non vérifiable depuis cet environnement

| Hôte | Statut | Conséquence |
| --- | --- | --- |
| `cursor.com`, `docs.cursor.com`, `cursor.sh` | 403, politique de sortie réseau de la session, y compris via l'outil de récupération de page | Toute la ligne Cursor reste `[?]`. Aucun repli : Cursor ne publie pas sa documentation en source ouverte |
| `developers.openai.com` | 403, même politique ; `docs/config.md` du dépôt Codex n'est plus qu'une redirection vers cet hôte | Les faits Codex marqués `[v]` viennent du code source du dépôt, pas de la documentation. Le payload des hooks Codex reste `[?]` |
| `docs.github.com` | 403, même politique | Contourné légitimement : le dépôt `github/docs` publie les fichiers qui rendent ces pages, lus en source |

Les résultats de moteur de recherche ne sont pas comptés comme des sources ici. Ils concordaient sur Copilot, ce qui a servi à trouver la bonne page, mais aucune affirmation du document ne repose dessus.
