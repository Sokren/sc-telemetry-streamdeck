"""Pont HTTP -> gRPC pour la télémétrie locale de Star Citizen.

Le jeu parle gRPC (HTTP/2 + protobuf binaire), qu'un plugin Stream Deck « requête web »
ne sait pas appeler. Ce pont expose une petite API HTTP/JSON classique :

    GET  http://127.0.0.1:8742/action/toggle_flashlight         -> déclenche l'action
    GET  http://127.0.0.1:8742/action/v_invoke_ping?hold_ms=1000 -> action maintenue
    GET  http://127.0.0.1:8742/actions                           -> liste des actions
    GET  http://127.0.0.1:8742/state                             -> dernière frame complète (JSON)
    GET  http://127.0.0.1:8742/value/vehicle.state.flight.state.gear -> une seule valeur (texte brut)

(POST marche aussi pour /action/...)

Prérequis : pip install grpcio protobuf
Lancement : python sc_bridge.py   (sc_extrait.desc dans le même dossier)
N'écoute que sur 127.0.0.1 : rien n'est accessible depuis le réseau.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import grpc
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
from google.protobuf.json_format import MessageToDict

PORT_HTTP = 8742
JEU = "127.0.0.1:2942"
# Schéma : sc_extrait.desc à côté de ce script, sinon dans ../schema/
_ICI = os.path.dirname(os.path.abspath(__file__))
_CANDIDATS = [os.path.join(_ICI, "sc_extrait.desc"), os.path.join(_ICI, "..", "schema", "sc_extrait.desc")]
SCHEMA = next((p for p in _CANDIDATS if os.path.exists(p)), _CANDIDATS[0])
SERVICE = "sc.game.telemetry.v1.GameTelemetryService"

fds = descriptor_pb2.FileDescriptorSet.FromString(open(SCHEMA, "rb").read())
pool = descriptor_pool.DescriptorPool()
for f in fds.file:
    pool.Add(f)
svc = pool.FindServiceByName(SERVICE)


def classes(methode):
    m = svc.FindMethodByName(methode)
    return message_factory.GetMessageClass(m.input_type), message_factory.GetMessageClass(m.output_type)


canal = grpc.insecure_channel(JEU)


def rpc(methode, flux=False):
    req_cls, rep_cls = classes(methode)
    fabrique = canal.unary_stream if flux else canal.unary_unary
    return req_cls, fabrique(f"/{SERVICE}/{methode}",
                             request_serializer=lambda r: r.SerializeToString(),
                             response_deserializer=rep_cls.FromString)


TrigReq, trigger = rpc("TriggerGameAction")
ListReq, lister = rpc("ListTriggerableActions")
StreamReq, stream = rpc("TelemetryStream", flux=True)

# --- Lecture continue du flux : on fusionne les sections, car une frame peut n'en contenir qu'une partie
etat = {"connecte": False, "frame": {}, "maj": {}}
verrou = threading.Lock()


def lire_flux():
    while True:
        try:
            for frame in stream(StreamReq()):
                d = MessageToDict(frame, preserving_proto_field_name=True)
                now = time.time()
                with verrou:
                    etat["connecte"] = True
                    for section, valeur in d.items():
                        etat["frame"][section] = valeur
                        etat["maj"][section] = now
        except grpc.RpcError:
            pass
        with verrou:
            etat["connecte"] = False
        time.sleep(3)  # jeu fermé ou pas encore spawné : on réessaie


def valeur(chemin):
    with verrou:
        v = etat["frame"]
        for cle in chemin.split("."):
            if not isinstance(v, dict) or cle not in v:
                return None
            v = v[cle]
        return v


class Handler(BaseHTTPRequestHandler):
    def repondre(self, code, corps, type_="application/json"):
        data = corps.encode() if isinstance(corps, str) else json.dumps(corps, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", f"{type_}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        parties = [p for p in url.path.split("/") if p]
        try:
            if len(parties) == 2 and parties[0] == "action":
                req = TrigReq(action_name=parties[1])
                hold = parse_qs(url.query).get("hold_ms")
                if hold:
                    req.hold_ms = int(hold[0])
                rep = trigger(req, timeout=2)
                self.repondre(200, MessageToDict(rep, preserving_proto_field_name=True))
            elif parties == ["actions"]:
                self.repondre(200, MessageToDict(lister(ListReq(), timeout=2), preserving_proto_field_name=True))
            elif parties == ["state"]:
                with verrou:
                    self.repondre(200, {"connecte": etat["connecte"], **etat["frame"]})
            elif len(parties) == 2 and parties[0] == "value":
                v = valeur(parties[1])
                texte = "N/A" if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
                self.repondre(200, texte, "text/plain")
            else:
                self.repondre(404, {"erreur": "route inconnue", "aide": __doc__})
        except grpc.RpcError as e:
            self.repondre(503, {"erreur": f"jeu injoignable : {e.code().name}", "detail": e.details()})
        except Exception as e:
            self.repondre(500, {"erreur": f"{type(e).__name__}: {e}"})

    do_POST = do_GET

    def log_message(self, fmt, *args):
        print(f"{time.strftime('%H:%M:%S')}  {self.address_string()}  {fmt % args}")


if __name__ == "__main__":
    threading.Thread(target=lire_flux, daemon=True).start()
    print(f"Pont prêt : http://127.0.0.1:{PORT_HTTP}/action/toggle_flashlight")
    ThreadingHTTPServer(("127.0.0.1", PORT_HTTP), Handler).serve_forever()
