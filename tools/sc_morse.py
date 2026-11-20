"""Fait clignoter la torche de Star Citizen en morse.

Utilisation (invite de commandes, dans le dossier de sc_extrait.desc) :
    python sc_morse.py                 -> SOS une fois
    python sc_morse.py SOS 3           -> SOS trois fois
    python sc_morse.py "HELLO" 1 300   -> texte, répétitions, durée d'une unité en ms

IMPORTANT : la torche doit être ÉTEINTE au départ. Le jeu ne permet que de la
basculer (toggle_flashlight) et n'indique pas son état.
Ctrl+C pour arrêter : le script remet la torche dans son état de départ.
"""
import os
import sys
import time
import grpc
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.",
    "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.",
    "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-", "U": "..-",
    "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--", "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
}

texte = (sys.argv[1] if len(sys.argv) > 1 else "SOS").upper()
repetitions = int(sys.argv[2]) if len(sys.argv) > 2 else 1
unite = (int(sys.argv[3]) if len(sys.argv) > 3 else 400) / 1000  # 400 ms par défaut

# Schéma : sc_extrait.desc à côté de ce script, sinon dans ../schema/
_ICI = os.path.dirname(os.path.abspath(__file__))
_CANDIDATS = [os.path.join(_ICI, "sc_extrait.desc"), os.path.join(_ICI, "..", "schema", "sc_extrait.desc")]
SCHEMA = next((p for p in _CANDIDATS if os.path.exists(p)), _CANDIDATS[0])
SERVICE = "sc.game.telemetry.v1.GameTelemetryService"
fds = descriptor_pb2.FileDescriptorSet.FromString(open(SCHEMA, "rb").read())
pool = descriptor_pool.DescriptorPool()
for f in fds.file:
    pool.Add(f)
m = pool.FindServiceByName(SERVICE).FindMethodByName("TriggerGameAction")
Req = message_factory.GetMessageClass(m.input_type)
Resp = message_factory.GetMessageClass(m.output_type)
appel = grpc.insecure_channel("127.0.0.1:2942").unary_unary(
    f"/{SERVICE}/TriggerGameAction",
    request_serializer=lambda r: r.SerializeToString(),
    response_deserializer=Resp.FromString)

allumee = False


def basculer():
    global allumee
    appel(Req(action_name="toggle_flashlight"), timeout=2)
    allumee = not allumee


def pause(n_unites, depart):
    """Attend jusqu'à depart + n unités, en compensant la durée de l'appel gRPC."""
    reste = depart + n_unites * unite - time.perf_counter()
    if reste > 0:
        time.sleep(reste)


def signe(duree):
    t = time.perf_counter()
    basculer()            # allume
    pause(duree, t)
    t = time.perf_counter()
    basculer()            # éteint
    pause(1, t)           # 1 unité entre deux signes


inconnus = [c for c in texte if c != " " and c not in MORSE]
if inconnus:
    sys.exit(f"Caractères non gérés : {''.join(inconnus)}")

print(f"Morse « {texte} » x{repetitions}, unité {unite * 1000:.0f} ms. Torche éteinte au départ ?")
try:
    for r in range(repetitions):
        for mot in texte.split():
            for lettre in mot:
                print(f"{lettre} {MORSE[lettre]}", flush=True)
                for s in MORSE[lettre]:
                    signe(1 if s == "." else 3)       # point = 1, trait = 3 unités
                time.sleep(2 * unite)                 # 3 unités entre lettres (1 déjà faite)
            time.sleep(4 * unite)                     # 7 unités entre mots (3 déjà faites)
        if r < repetitions - 1:
            time.sleep(7 * unite)
except KeyboardInterrupt:
    print("Arrêt.")
except grpc.RpcError as e:
    sys.exit(f"Erreur gRPC {e.code().name} : {e.details()} (jeu lancé et perso spawné ?)")
finally:
    if allumee:  # ne pas laisser la torche allumée en cas d'interruption
        try:
            basculer()
        except grpc.RpcError:
            pass
