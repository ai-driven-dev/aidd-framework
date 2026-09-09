# Payer la dette du raisonnement, pas seulement celle des dossiers

status: implemented

## D'où ça vient

Une relecture indépendante du commit `224deafa` a confirmé le déplacement — neuf renommages
identiques octet pour octet une fois les préfixes d'import normalisés, trois socles repointés
et jamais grossis, les neuf cellules golden inchangées. Elle a trouvé dix défauts, et aucun
n'est dans le code déplacé : ils sont tous dans le raisonnement écrit autour.

C'est la même signature que le reste de la session. Je mesure un échantillon, je conclus sur
l'ensemble, et j'écris la conclusion comme une mesure. Ici : « aucun regroupement non
arbitraire dans le noyau » alors que la paire qui le réfute est dans le dossier ; « treize
fichiers, un par commande » alors qu'il y en a douze et que treize plus deux ne font pas
quatorze ; « 485 fichiers lintés, 1 001 suites » alors que l'outil dit 511 et 205.

## Ce qu'on obtient

Les compteurs cessent d'être des affirmations. L'arbre de test cesse de cacher le défaut que
l'arbre de source vient de payer. Le socle de taille tombe à une entrée.

## Phases

| # | Phase | Ce qu'elle ferme |
| - | ----- | ---------------- |
| 1 | La paire que la raison du noyau omettait | F3 |
| 2 | L'arbre de test suit l'arbre de source | F1 |
| 3 | Un compteur qu'on ne peut plus écrire faux | F2, F9, F10 |
| 4 | Les chiffres faux, là où ils sont écrits | F4, F5, F6, F8 |

## Ce qui reste hors de portée

Deux commits déjà écrits (`224deafa`, `884501da`) portent les chiffres de gate faux. Rien
n'est poussé, donc la réécriture reste possible ; elle n'est pas prise ici parce que
réécrire l'historique n'est pas une décision d'agent. Le commit de clôture les nomme et
donne les vrais chiffres, pour que le lecteur du journal trouve la correction sans la
chercher.

Le non-découpage de `contexts/framework` tient : deux relectures indépendantes y arrivent.
Ce qui saute est le chiffre qui le justifiait, irreproductible sous tout prédicat essayé.
La raison qualitative reste, elle est vérifiable en lisant le dossier.
