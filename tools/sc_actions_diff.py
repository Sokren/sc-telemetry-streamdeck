"""Repère les commandes ajoutées ou retirées par un patch de Star Citizen.

Deux comparaisons :

  exe   Lit la table des noms de commandes dans StarCitizen.exe (lecture seule) et la compare à une
        liste sauvegardée. Sans lancer le jeu. Donne des *candidates* : le jeu ne rend déclenchables
        par l'API qu'une partie de ces commandes (112 sur ~970 en 5.0 PTU).

        python sc_actions_diff.py exe "<...>\\StarCitizen.exe" --compare ..\\schema\\command_names.json
        python sc_actions_diff.py exe "<...>\\StarCitizen.exe" --save ..\\schema\\command_names.json --version "5.0 PTU build 13238477"

  live  Jeu lancé et perso spawné : demande au jeu la liste réelle des actions déclenchables
        (ListTriggerableActions) et la compare à l'instantané schema/actions.json.

        python sc_actions_diff.py live
        python sc_actions_diff.py live --update --version "5.0 PTU build 13238477"

Ne modifie jamais les fichiers du jeu. Prérequis : pip install grpcio protobuf (mode live seulement).
"""
import argparse
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SCHEMA_DIR = os.path.join(ICI, "..", "schema")
SNAPSHOT = os.path.join(SCHEMA_DIR, "actions.json")
IDENT = re.compile(rb"(?<=\x00)([a-z][a-z0-9_]{2,63})(?=\x00)")


def charger_json(chemin):
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def ecrire_json(chemin, donnees):
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(donnees, f, indent=2, ensure_ascii=False)
        f.write("\n")


def ancres():
    """Noms connus servant à retrouver la table dans l'exe : les actions de l'instantané."""
    return {a["action_name"] for a in charger_json(SNAPSHOT)["actions"]}


def noms_de_commandes(exe):
    """Identifiants de la table des commandes de l'exe.

    Part du groupe des noms connus, puis étend la zone bloc par bloc tant que chaque bloc contient
    encore des identifiants : le résultat ne dépend que de l'exe et de l'instantané.
    """
    with open(exe, "rb") as f:
        data = f.read()
    positions = sorted(i for i in (data.find(b"\x00" + n.encode() + b"\x00") for n in ancres()) if i >= 0)
    if len(positions) < 10:
        sys.exit("Table des commandes introuvable : trop peu de noms connus dans cet exécutable.")
    # Écarte les positions isolées (un nom connu présent ailleurs dans l'exe) : on garde le groupe dense.
    milieu = positions[len(positions) // 2]
    groupe = [p for p in positions if abs(p - milieu) < 1_000_000]
    debut, fin = groupe[0], groupe[-1]
    bloc = 512
    while debut > bloc and len(IDENT.findall(data[debut - bloc:debut])) >= 3:
        debut -= bloc
    while fin + bloc < len(data) and len(IDENT.findall(data[fin:fin + bloc])) >= 3:
        fin += bloc
    return sorted({m.decode() for m in IDENT.findall(data[debut:fin])}), len(groupe), len(positions)


def afficher_diff(titre_ajout, titre_retrait, avant, apres):
    ajoutes, retires = sorted(apres - avant), sorted(avant - apres)
    print(f"\n{titre_ajout} ({len(ajoutes)}) :")
    for n in ajoutes:
        print(f"  + {n}")
    print(f"{titre_retrait} ({len(retires)}) :")
    for n in retires:
        print(f"  - {n}")
    return ajoutes, retires


def mode_exe(args):
    noms, dans_groupe, trouves = noms_de_commandes(args.exe)
    print(f"{len(noms)} noms de commandes lus dans la table ({dans_groupe}/{trouves} noms connus regroupés).")
    if args.compare:
        ancien = charger_json(args.compare)
        print(f"Comparaison avec {args.compare} ({ancien.get('game_version', '?')}, {len(ancien['commands'])} noms)")
        afficher_diff("Commandes apparues", "Commandes disparues", set(ancien["commands"]), set(noms))
        print("\nRappel : seules certaines commandes sont déclenchables par l'API ; vérifier jeu lancé avec « live ».")
    if args.save:
        ecrire_json(args.save, {"game_version": args.version or "?", "commands": noms})
        print(f"Liste écrite : {args.save}")


def actions_du_jeu():
    import grpc
    from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

    candidats = [os.path.join(ICI, "sc_extrait.desc"), os.path.join(SCHEMA_DIR, "sc_extrait.desc")]
    schema = next((p for p in candidats if os.path.exists(p)), candidats[0])
    fds = descriptor_pb2.FileDescriptorSet.FromString(open(schema, "rb").read())
    pool = descriptor_pool.DescriptorPool()
    for f in fds.file:
        pool.Add(f)
    service = "sc.game.telemetry.v1.GameTelemetryService"
    m = pool.FindServiceByName(service).FindMethodByName("ListTriggerableActions")
    req = message_factory.GetMessageClass(m.input_type)
    rep = message_factory.GetMessageClass(m.output_type)
    appel = grpc.insecure_channel("127.0.0.1:2942").unary_unary(
        f"/{service}/ListTriggerableActions",
        request_serializer=lambda r: r.SerializeToString(),
        response_deserializer=rep.FromString)
    try:
        reponse = appel(req(), timeout=3)
    except grpc.RpcError as e:
        sys.exit(f"Jeu injoignable ({e.code().name}) : jeu lancé, télémétrie activée et perso spawné ?")
    return [{"action_name": a.action_name, "category": a.category, "holdable": a.holdable} for a in reponse.actions]


def mode_live(args):
    vivantes = actions_du_jeu()
    instantane = charger_json(args.snapshot)
    avant = {a["action_name"]: a for a in instantane["actions"]}
    apres = {a["action_name"]: a for a in vivantes}
    print(f"{len(apres)} actions déclenchables d'après le jeu ; instantané {instantane.get('game_version', '?')} : {len(avant)}.")
    afficher_diff("Actions ajoutées", "Actions retirées", set(avant), set(apres))
    modifiees = [n for n in set(avant) & set(apres)
                 if (avant[n]["category"], avant[n].get("holdable", False)) != (apres[n]["category"], apres[n]["holdable"])]
    print(f"Actions modifiées (catégorie ou maintien) ({len(modifiees)}) :")
    for n in sorted(modifiees):
        print(f"  ~ {n} : {avant[n]['category']} → {apres[n]['category']}, maintien {apres[n]['holdable']}")
    if args.update:
        if not args.version:
            sys.exit("--update demande --version (ex. « 5.0 PTU build 13238477 »).")
        vivantes.sort(key=lambda a: (a["category"], a["action_name"]))
        ecrire_json(args.snapshot, {"game_version": args.version, "actions": vivantes})
        print(f"Instantané mis à jour : {args.snapshot} — penser aux libellés FR / EN des nouvelles actions.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sous = p.add_subparsers(dest="mode", required=True)
    e = sous.add_parser("exe", help="comparer la table des commandes de StarCitizen.exe")
    e.add_argument("exe")
    e.add_argument("--compare", help="liste sauvegardée (command_names.json) à comparer")
    e.add_argument("--save", help="écrire la liste lue dans ce fichier")
    e.add_argument("--version", help="version du jeu à inscrire avec --save")
    l = sous.add_parser("live", help="comparer la liste du jeu lancé à l'instantané")
    l.add_argument("--snapshot", default=SNAPSHOT)
    l.add_argument("--update", action="store_true", help="réécrire l'instantané avec la liste du jeu")
    l.add_argument("--version", help="version du jeu à inscrire avec --update")
    args = p.parse_args()
    mode_exe(args) if args.mode == "exe" else mode_live(args)


if __name__ == "__main__":
    main()
