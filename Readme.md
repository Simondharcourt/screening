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


Plan d'implémentation:

⏺ Plan d'implémentation

  ---
  Phase 1 — Fondations (1-2 jours)

  Objectif : avoir un projet qui tourne bout en bout, vide.

  1. Créer le projet Supabase (région EU), définir le schéma de base :
  users (id, role: recruiter|candidate, email, created_at)
  job_postings (id, recruiter_id, title, description, questions, created_at)
  candidates (id, user_id, profile_text, cv_url, created_at)
  screenings (id, job_posting_id, candidate_id, status, compatibility_score, created_at)
  2. Initialiser le projet FastAPI avec une structure claire :
  app/
    routers/        # routes par domaine (jobs, candidates, screenings)
    agents/         # agents LangGraph
    services/       # logique métier
    models/         # schémas Pydantic
  3. Initialiser le front Vite + React + TanStack Router + TanStack Query
  4. Brancher Supabase Auth des deux côtés (front + back) — magic link suffit pour commencer
  5. Déployer les squelettes sur Railway (back) et Vercel (front)

  ---
  Phase 2 — Core recruteur sans IA (2-3 jours)

  Objectif : valider les flux métier avant d'ajouter l'IA.

  - CRUD fiche de poste (titre, description, questions saisis manuellement)
  - Ajout de candidats à une fiche
  - Dashboard recruteur : liste des fiches, liste des candidats par fiche, statut
  - Upload CV candidat → Supabase Storage

  Règle : ne pas toucher à LangGraph tant que ce flux ne fonctionne pas end-to-end.

  ---
  Phase 3 — Premier agent : génération de fiche de poste (2-3 jours)

  Objectif : remplacer la saisie manuelle par l'IA.

  - Créer l'agent LangGraph de génération de fiche de poste
    - Input : titre + bullet points
    - Output : description complète + questions de screening structurées
  - Brancher LangSmith dès maintenant pour tracer tous les appels d'agents
  - Exposer un endpoint FastAPI /jobs/generate
  - Modifier le front : formulaire simplifié → appel à l'agent → affichage du résultat éditable avant sauvegarde

  ---
  Phase 4 — Agent coach candidat (3-4 jours)

  Objectif : permettre au candidat de construire son profil via dialogue.

  - Créer l'agent LangGraph de coaching candidat
    - Dialogue multi-tours par écrit
    - À chaque échange, l'agent enrichit une structure de profil (compétences, expériences, recherche)
    - À la fin, génère un profil textuel structuré sauvegardé en base
  - Interface chat côté candidat (TanStack Query + streaming SSE depuis FastAPI)
  - Import LinkedIn/CV comme point de départ du dialogue (parsing basique)

  ---
  Phase 2 bis — Scraper d'offres externes (1-2 jours, en parallèle de la phase 2)

  Objectif : amorcer la base avec des offres réelles avant d'avoir des recruteurs inscrits.

  - Créer un worker Celery qui interroge l'API France Travail toutes les 6h
  - Normaliser les offres dans le schéma job_postings avec source=france_travail
  - Générer les embeddings (OpenAI text-embedding-3-small) pour chaque offre importée
  - Les offres externes ne déclenchent pas d'appels Vapi — elles servent uniquement à la recommandation

  ---
  Phase 5 — Score de compatibilité + RAG (2-3 jours)

  Objectif : calculer le matching et alimenter les recommandations.

  - Activer l'extension pgvector sur Supabase
  - Générer et stocker les embeddings à chaque création/modification de profil ou fiche de poste
  - Endpoint de recommandation : SELECT ... ORDER BY embedding <=> [vecteur] LIMIT 10
  - Score de compatibilité LLM (appel direct, pas LangGraph) : prend profil + fiche de poste → retourne un score 0-100 + justification détaillée
  - Afficher le score et les recommandations sur le dashboard recruteur
  - Débloquer les deux boutons : "Contacter" / "Déclencher le screening vocal"

  ---
  Phase 6 — Agent vocal Vapi (4-5 jours)

  Objectif : déclencher et gérer l'appel de pré-qualification.

  C'est la phase la plus complexe — prévoir des imprévus.

  1. Setup Vapi : créer un assistant Vapi avec les questions générées à la phase 3
  2. Endpoint de déclenchement FastAPI /screenings/{id}/call → appelle l'API Vapi avec le numéro du candidat
  3. Webhook Vapi → FastAPI : Vapi envoie les événements en temps réel (call started, transcript partiel, call ended)
  4. Traitement post-appel :
    - Stocker le transcript dans Supabase
    - Supprimer l'audio (RGPD)
    - Mettre à jour le statut du screening
  5. Redis pour la queue : si plusieurs appels simultanés, les mettre en file pour éviter les race conditions
  6. Fallback : si l'appel échoue 2 fois, proposer automatiquement le format écrit au candidat
  7. Afficher le transcript sur le dashboard recruteur en temps réel (Supabase Realtime)

  ---
  Ordre de priorité résumé

  Phase 1   — Fondations             ← fait tourner le projet
  Phase 2   — Core recruteur         ← valide le flux métier
  Phase 2b  — Scraper offres ext.    ← alimente la base, parallélisable
  Phase 3   — Agent fiche de poste   ← premier agent, valeur immédiate recruteur
  Phase 4   — Agent coach candidat   ← valeur côté candidat
  Phase 5   — Score matching + RAG   ← connecte les deux côtés
  Phase 6   — Agent vocal Vapi       ← le plus risqué, en dernier

  ---