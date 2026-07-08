# Nom de l'application — Décision

> Date : 2026-07-08
> Statut : Validé

## Décision

Nom retenu : **Dodojo**

## Contexte

Le produit ("Boss de la Journée" en nom de code specs) avait besoin d'un nom de marque distinct du nom de code interne utilisé dans SPECS_FONCTIONNELLES.md et ADR.md.

## Processus

Brainstorm itératif à partir de plusieurs directions :
1. Puns anglais brandables (SlayList, ToDoJo, HitList) — écartés, pas assez FR.
2. Noms FR proches du nom de code (Boss du Jour, L'Arène, Quête ou Trépas) — écartés.
3. Direction "productivité déguisée" (Grindstone, Questline, Bossline) — écartés, prononciation trop anglaise pour public FR.
4. Direction FR simple (Riposte, Offensive, Cadence) — écartés, pas retenus par l'utilisateur.
5. Seeds fournis par l'utilisateur : "to do", "dojo", "daily do", "travel quests", "ma journée" → fusions bilingues (DoJour, DoJourney, Todojo) — écartés, pas assez punchy.
6. Versions punchy/rythmées (Dodojo, MonDojo, Jourdo) → **Dodojo retenu**.

## Justification

- Répétition rythmée "Do-Do-Jo" : mémorable à l'oral, facile à prononcer pour un public francophone.
- Fusion de "to-do" (action) et "dojo" (lieu d'entraînement/combat) : cohérent avec le concept RPG/combat de boss quotidien.
- Fonctionne comme nom de marque international (pas de mot anglais complexe, pas de traduction nécessaire).

## Impact

- Le nom de code interne "Boss de la Journée" reste utilisé dans les documents produit existants (SPECS_FONCTIONNELLES.md, ADR.md) pour désigner le concept ; **Dodojo** est le nom de marque commercial de l'application.
- Le dossier projet / repo pourra être nommé `dodojo` lors du scaffold technique.
- Aucun changement de règles métier (RG-01 à RG-04) ni de tone of voice : à traiter dans une session de brainstorm séparée.

## Hors scope

- Vérification de disponibilité de domaine / réseaux sociaux (explicitement écartée comme contrainte par l'utilisateur).
- Design du logo / identité visuelle.
