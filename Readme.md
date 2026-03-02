HR AI Platform — plateforme open-source de screening de candidats par IA

L'idée centrale : automatiser la première étape du recrutement — le screening téléphonique — en la remplaçant par un agent vocal IA, puis en évaluant automatiquement les réponses des candidats.

L'objectif côté recruteur est d'avoir accès à un vivier de candidats, en sachant précisément ce qu'ils recherchent, et d'avoir des suggestions de candidats pertinentes en fonction de ce qu'ils cherchent.
Il peut faire générer une fiche de poste en fonction de ses besoins, puis faire générer une interview de pré-qualification à envoyer à un candidat.
Il y a d'abord un premier score de compatibilité entre l'offre et le candidat pour connaître le % de matching, et à partir de ça le recruteur a accès à 2 boutons: contact directement le candidat, ou le solliciter pour un appel de pré-qualification.
A l'issue de cet appel de pré-qualification, un score de performance apparaîtra sur la plateforme du recruteur et s'ajoutera au score de compatibilité.

Côté recruteur, la plateforme permet de :

- Créer une fiche de poste en donnant juste un titre et quelques bullet points — l'IA génère la description complète et les questions de screening adaptées
- Ajouter des candidats à cette fiche
- Déclencher un appel vocal automatique vers le candidat, conduit par l'agent IA
- Consulter un dashboard avec les transcripts, les scores et une recommandation par candidat. Le détail du scoring est toujours affiché (pas juste un chiffre) pour garder un humain dans la boucle.

Côté candidat, la plateforme permet de :

- S'inscrire et présenter son profil sur la plateforme. L'import depuis LinkedIn/CV est supporté dès le début pour réduire la friction d'inscription.
- Dialoguer avec un agent IA par écrit pour mieux expliquer son projet, ce qu'il cherche et ses expériences. Cet agent agit comme un coach et chercheur de tête, va rédiger son profil et éventuellement lui proposer des fiches de poste ou d'entreprise, pour mieux comprendre ce qu'il cherche. C'est le service à valeur principale pour le candidat — pas juste un outil au service des recruteurs.
- Manifester son intérêt pour une fiche de poste ou une entreprise, à partir de là il peut être sollicité pour un appel de pré-qualification (faite par un agent vocal).

Stratégie d'adoption :

La distribution commence en B2B : les entreprises envoient le lien de la plateforme aux candidats qu'elles ont déjà sourcés. Cela évite d'avoir à convaincre les candidats de venir seuls et permet de valider le produit rapidement. L'acquisition organique côté candidat vient dans un second temps, portée par la valeur du coach IA.

Côté IA, sous le capot :

- Un agent de génération de fiche de poste (LangGraph) qui structure le job à partir d'un input minimal.
- Un agent vocal de screening (LangGraph + Vapi) qui appelle le candidat pour la pré-qualification, pose les questions, relance si les réponses sont trop courtes, et gère la fin de l'entretien. Un fallback écrit est toujours proposé si l'appel échoue ou si le candidat préfère ce format.
- Un agent d'évaluation (LLM-as-judge) qui analyse le transcript et score le candidat sur des critères observables (clarté de l'expression, cohérence du parcours, maîtrise du sujet) — pas de traits de personnalité pour éviter tout risque légal.
- Un agent qui aide le candidat à affiner son profil à travers un dialogue à l'écrit (LangGraph).
- Un moteur de recommandation RAG (pgvector + embeddings) qui suggère des offres pertinentes aux candidats et des candidats pertinents aux recruteurs, par recherche sémantique sur les profils et fiches de poste.
- Un worker asynchrone (Celery) qui ingère des offres d'emploi externes (France Travail API en priorité) pour alimenter la base dès le lancement, avant même d'avoir des recruteurs inscrits. Les offres externes servent uniquement à la recommandation — elles ne déclenchent pas d'appels Vapi.

C'est toujours l'entreprise qui paie les entretiens de pré-qualification (pour ça qu'on peut se permettre de le faire à l'oral, pour saisir aussi les hésitations du candidat). (selon des formules de quotas)

RGPD & conformité :

- Consentement explicite envoyé par lien avant tout déclenchement d'appel vocal
- Droit à l'effacement : suppression de compte et de toutes les données associées disponible à tout moment
- Hébergement EU pour toutes les données sensibles (transcripts, profils)
- Les audios ne sont pas conservés après transcription
- Les transcripts bruts restent accessibles au recruteur pour vérification humaine

Côté technique :

**Front-end**
Vite + React + TanStack Query + TanStack Router. Stack SPA pure sans surcharge SSR — l'application est entièrement authentifiée, Next.js n'apporte rien ici. TanStack Query gère le cache et les états de chargement pour le dashboard, TanStack Router assure un routing typesafe côté client.

**Back-end**
FastAPI (Python). Async natif, idéal pour orchestrer des appels LangGraph en parallèle et gérer les webhooks Vapi sans bloquer.

**Base de données**
PostgreSQL via Supabase. Le modèle de données est fondamentalement relationnel (Recruteur → Fiche de poste → Candidat → Screening → Score) — MongoDB ne serait pas adapté ici. Supabase apporte en plus : auth intégrée, storage pour les CVs, realtime pour l'affichage live des scores sur le dashboard, SDK TypeScript auto-généré, et hébergement EU pour la conformité RGPD. L'extension pgvector est activée sur la même base pour stocker les embeddings des profils et fiches de poste — pas besoin d'une base vectorielle séparée.

Schéma enrichi :
- `job_postings` : + `source` (internal | france_travail | ...), `external_id`, `external_url`, `embedding vector(1536)`
- `candidates` : + `embedding vector(1536)`

**Cache / Queue / Worker**
Redis + Celery. Redis gère les files d'attente pour les appels Vapi et les sessions LangGraph persistantes. Celery s'appuie sur Redis pour le worker d'ingestion d'offres externes (scraping planifié toutes les X heures).

**Agents IA**
LangGraph. Orchestration des agents avec état persistant entre les étapes.

**Agent vocal**
Vapi. API webhook simple, gestion STT/TTS et transcripts automatiques inclus.

**LLM**
Claude API (Anthropic). Meilleur sur les tâches de raisonnement long (évaluation de transcripts, génération de fiches de poste structurées).

**Observabilité**
LangSmith. Traces LangGraph, debug des agents en production — indispensable pour comprendre ce qui se passe dans les agents.

**Auth & Storage**
Supabase Auth (magic link + OAuth) et Supabase Storage pour les CVs et transcripts. Inclus dans la stack Supabase, hébergement EU.

**Déploiement**
- Back-end : Railway (déploiement depuis GitHub, région EU)
- Front-end : Vercel (zéro config pour Vite/React)

| Couche | Outil |
|---|---|
| Front-end | Vite + React + TanStack Query + TanStack Router |
| Back-end | FastAPI (Python) |
| Base de données | Supabase (PostgreSQL) |
| Cache / Queue / Worker | Redis + Celery |
| Embeddings | OpenAI text-embedding-3-small |
| Recherche vectorielle | pgvector (Supabase) |
| Offres externes | France Travail API |
| Agents IA | LangGraph |
| Agent vocal | Vapi |
| LLM | Claude API (Anthropic) |
| Observabilité agents | LangSmith |
| Auth & Storage | Supabase Auth + Supabase Storage |
| Déploiement back | Railway (EU) |
| Déploiement front | Vercel |

