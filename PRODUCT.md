# Product

## Register

product

## Users

Thomas, développeur/créateur indépendant surchargé. Croule sous les micro-tâches, déteste l'administratif, sujet à la charge mentale (profil TDAH-friendly). A besoin d'un shoot de dopamine immédiat pour avancer dans sa journée de travail, pas d'un outil de productivité de plus qui ressemble à du travail.

## Product Purpose

Transformer la liste de tâches quotidienne en combat de boss d'arcade : chaque tâche ajoutée soigne le Boss du jour, chaque tâche complétée lui inflige des dégâts. Succès = terminer sa journée de travail l'esprit léger, avec une gratification immédiate et viscérale à chaque tâche cochée, plutôt qu'une liste qui s'accumule silencieusement.

## Brand Personality

Élève de dojo d'arts martiaux qui se bat dans la rue — vibe Ryu/Ken (Street Fighter). Discipline et humilité du dojo, mais grinta et franc-parler du combat de rue : jamais coincé, jamais corporate. Deux voix distinctes : un Sensei qui commente tes combats quotidiens (mentor, direct, tutoiement systématique) et le Boss qui te nargue en 1ère personne. Jurons légers dosés aux pics émotionnels réels (level up, victoire, échec), jamais en tic de langage mécanique. Détail complet : `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`.

## Anti-references

Pas corporate/minimaliste — éviter le look Notion/Linear/SaaS épuré qui tuerait le fun arcade. Ce n'est pas un tableur déguisé : l'esthétique borne d'arcade 16-32 bits (pixel art, jauges de vie, flashs de combat, secousses d'écran) doit dominer visuellement, pas être une décoration en surface d'une UI de productivité classique.

## Design Principles

1. Gratification immédiate avant perfection UI — le feedback direct (flash, dégâts, texte flottant) prime sur la sobriété visuelle.
2. Ton constant, jamais corporate — même les erreurs techniques et écrans vides restent dans l'univers dojo/rue.
3. Mobile-first, une main — usage rapide entre deux tâches réelles, pas de friction pour ajouter/valider une tâche.
4. Transformation, jamais suppression silencieuse — reflète RG-04 : une tâche abandonnée ou reportée reste visible dans son nouvel état, jamais supprimée sans trace.
5. Le pseudo du joueur, jamais une appellation générique — personnalisation dès l'onboarding, pas de fallback "Héros".

## Accessibility & Inclusion

Best-effort — pas de niveau WCAG cible formalisé à ce stade. `prefers-reduced-motion` est déjà implémenté (US-21) : toutes les animations de combat (flash, secousse, texte flottant, skeleton, KO/PERFECT, combo, alarme deadline, flammes de série) ont une alternative sans mouvement. Reste à revisiter explicitement avant un usage large : niveau WCAG cible, contraste des jauges HP/XP sur le décor `.combat-scene`.
