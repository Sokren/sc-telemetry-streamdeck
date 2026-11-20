"""Affiche les champs que le jeu envoie dans la télémétrie mais que le schéma
(sc_extrait.desc) ne connaît pas, et signale quand leur valeur change.

Utilisation (perso spawné) :
    pip install grpcio protobuf
    python sc_champs_inconnus.py
Puis allume / éteins la torche plusieurs fois et regarde quelle ligne bouge.
Option : python sc_champs_inconnus.py autre_schema.desc
"""
import os
import struct
import sys
import grpc
from google.protobuf import descriptor_pb2, descriptor_pool

# Schéma : sc_extrait.desc à côté de ce script, sinon dans ../schema/
_ICI = os.path.dirname(os.path.abspath(__file__))
_CANDIDATS = [os.path.join(_ICI, "sc_extrait.desc"), os.path.join(_ICI, "..", "schema", "sc_extrait.desc")]
SCHEMA = sys.argv[1] if len(sys.argv) > 1 else next((p for p in _CANDIDATS if os.path.exists(p)), _CANDIDATS[0])

fds = descriptor_pb2.FileDescriptorSet.FromString(open(SCHEMA, "rb").read())
pool = descriptor_pool.DescriptorPool()
for f in fds.file:
    pool.Add(f)
svc = pool.FindServiceByName("sc.game.telemetry.v1.GameTelemetryService")
methode = svc.FindMethodByName("TelemetryStream")


def varint(buf, pos):
    res = shift = 0
    while True:
        b = buf[pos]
        pos += 1
        res |= (b & 0x7F) << shift
        if not b & 0x80:
            return res, pos
        shift += 7


def champs_bruts(buf):
    """Découpe un message protobuf brut en (numéro, type de fil, valeur)."""
    pos = 0
    while pos < len(buf):
        tag, pos = varint(buf, pos)
        num, wt = tag >> 3, tag & 7
        if wt == 0:
            v, pos = varint(buf, pos)
        elif wt == 1:
            v = buf[pos:pos + 8]; pos += 8
        elif wt == 5:
            v = buf[pos:pos + 4]; pos += 4
        elif wt == 2:
            n, pos = varint(buf, pos)
            v = buf[pos:pos + n]; pos += n
        else:
            raise ValueError(f"type de fil {wt} non géré")
        if num == 0 or pos > len(buf):
            raise ValueError("message invalide")
        yield num, wt, v


def lisible(wt, v):
    if wt == 0:
        return v
    if wt == 5:
        return f"{struct.unpack('<f', v)[0]:.4g} (f32) / {struct.unpack('<I', v)[0]} (u32)"
    if wt == 1:
        return f"{struct.unpack('<d', v)[0]:.6g} (f64)"
    try:  # sous-message ?
        return {f"#{n}": lisible(w, x) for n, w, x in champs_bruts(v)} or "''"
    except Exception:
        try:
            return repr(v.decode("utf-8"))
        except UnicodeDecodeError:
            return v.hex()


def est_repete(c):
    # protobuf récent : is_repeated ; anciennes versions : label
    if hasattr(c, "is_repeated"):
        return c.is_repeated
    return c.label == c.LABEL_REPEATED


def inconnus(buf, desc, chemin, sortie, visites):
    visites.add(chemin)
    compte = {}
    for num, wt, v in champs_bruts(buf):
        c = desc.fields_by_number.get(num)
        i = compte[num] = compte.get(num, -1) + 1
        nom = c.name if c else f"#{num}"
        p = f"{chemin}.{nom}" if chemin else nom
        if c and est_repete(c):
            p += f"[{i}]"
        if c is None:
            sortie[p] = lisible(wt, v)
        elif c.message_type is not None and wt == 2:
            inconnus(v, c.message_type, p, sortie, visites)


canal = grpc.insecure_channel("127.0.0.1:2942")
flux = canal.unary_stream(f"/{svc.full_name}/{methode.name}",
                          request_serializer=lambda b: b,
                          response_deserializer=lambda b: b)

print("En attente des frames (spawn requis)... Ctrl+C pour quitter.\n")
etat = {}
try:
    for frame in flux(b""):
        vus, visites = {}, set()
        inconnus(frame, methode.output_type, "", vus, visites)
        for p, v in vus.items():
            if p not in etat:
                print(f"[nouveau] {p} = {v}")
            elif etat[p] != v:
                print(f"[change ] {p} : {etat[p]} -> {v}")
            etat[p] = v
        # Un champ absent alors que son message parent est présent = valeur par défaut (0 / false)
        for p in list(etat):
            parent = p.rsplit(".", 1)[0] if "." in p else ""
            if p not in vus and parent in visites:
                print(f"[absent ] {p} : {etat.pop(p)} -> (0 / false / vide)")
except KeyboardInterrupt:
    pass
except grpc.RpcError as e:
    sys.exit(f"Erreur gRPC : {e.code().name} — {e.details()}")
