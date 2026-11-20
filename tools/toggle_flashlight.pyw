"""Déclenche une action Star Citizen via la télémétrie locale (127.0.0.1:2942).

L'action déclenchée est le NOM DE CE FICHIER : toggle_flashlight.pyw -> "toggle_flashlight".
Copie et renomme le fichier pour d'autres boutons : v_lights_on.pyw, v_deploy_landing_system.pyw...
Option : ajoute "__1000" au nom pour une action maintenue 1000 ms (ex. v_invoke_ping__1000.pyw).

Extension .pyw = lancé par pythonw, sans fenêtre console (le jeu garde le focus).
Les erreurs sont écrites dans sc_action.log, à côté de ce fichier.
"""
import os
import sys
import datetime
import grpc
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

DOSSIER = os.path.dirname(os.path.abspath(__file__))
# Schéma : sc_extrait.desc à côté de ce script, sinon dans ../schema/
_ICI = DOSSIER
_CANDIDATS = [os.path.join(_ICI, "sc_extrait.desc"), os.path.join(_ICI, "..", "schema", "sc_extrait.desc")]
SCHEMA = next((p for p in _CANDIDATS if os.path.exists(p)), _CANDIDATS[0])
SERVICE = "sc.game.telemetry.v1.GameTelemetryService"


def log(msg):
    with open(os.path.join(DOSSIER, "sc_action.log"), "a", encoding="utf-8") as f:
        f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S}  {msg}\n")


try:
    nom = os.path.splitext(os.path.basename(__file__))[0]
    action, _, hold = nom.partition("__")

    fds = descriptor_pb2.FileDescriptorSet.FromString(open(SCHEMA, "rb").read())
    pool = descriptor_pool.DescriptorPool()
    for f in fds.file:
        pool.Add(f)
    m = pool.FindServiceByName(SERVICE).FindMethodByName("TriggerGameAction")
    Req = message_factory.GetMessageClass(m.input_type)
    Resp = message_factory.GetMessageClass(m.output_type)

    req = Req(action_name=action)
    if hold:
        req.hold_ms = int(hold)

    appel = grpc.insecure_channel("127.0.0.1:2942").unary_unary(
        f"/{SERVICE}/TriggerGameAction",
        request_serializer=lambda r: r.SerializeToString(),
        response_deserializer=Resp.FromString)
    rep = appel(req, timeout=2)
    log(f"{action}: status={rep.status} message={rep.message!r}")
except grpc.RpcError as e:
    log(f"ERREUR gRPC {e.code().name}: {e.details()} (jeu lancé et perso spawné ?)")
    sys.exit(1)
except Exception as e:
    log(f"ERREUR {type(e).__name__}: {e}")
    sys.exit(1)
