"""Cherche dans StarCitizen.exe le schéma protobuf de la télémétrie embarqué
par le code gRPC/protobuf compilé, et le reconstruit.

Utilisation :
    pip install protobuf
    python sc_extract_proto.py "J:\\Jeux\\Roberts Space Industries\\StarCitizen\\PTU\\Bin64\\StarCitizen.exe"
    python sc_extract_proto.py <exe> --compare schema.desc   (compare au schéma communautaire)

Produit :
    sc_extrait.desc   -> utilisable avec grpcurl -protoset ou à la place de schema.desc
    sc_extrait.proto  -> version lisible
Lecture seule : le fichier .exe est seulement lu, jamais modifié.
"""
import re
import sys
from google.protobuf import descriptor_pb2

FILTRE = re.compile(rb"^sc/game/telemetry/")  # fichiers .proto à garder (exclut opentelemetry)

# Champs de FileDescriptorProto -> type de fil attendu (2 = longueur, 0 = varint)
WT_ATTENDU = {1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2,
              10: 0, 11: 0, 12: 2, 14: 0}


def varint(data, pos):
    res = shift = 0
    while True:
        if pos >= len(data) or shift > 63:
            raise ValueError
        b = data[pos]
        pos += 1
        res |= (b & 0x7F) << shift
        if not b & 0x80:
            return res, pos
        shift += 7


def decouper(data, debut):
    """Avance champ par champ tant que ça ressemble à un FileDescriptorProto.
    Renvoie la liste des positions de fin de chaque champ."""
    pos, fins, dernier = debut, [], 0
    while pos < len(data):
        try:
            tag, p = varint(data, pos)
            num, wt = tag >> 3, tag & 7
            if WT_ATTENDU.get(num) != wt:
                break
            # protoc sérialise les champs par numéro croissant ; le nom (1) est unique
            if num < dernier or (num == 1 and dernier == 1):
                break
            dernier = num
            if wt == 0:
                _, p = varint(data, p)
            else:
                n, p = varint(data, p)
                if n > 5_000_000 or p + n > len(data):
                    break
                p += n
        except ValueError:
            break
        pos = p
        fins.append(pos)
    return fins


def extraire(data):
    fichiers = {}
    # Un FileDescriptorProto sérialisé commence par : 0x0A <longueur> "<nom>.proto"
    for m in re.finditer(rb"\x0a([\x01-\x7f])([\w./-]+?\.proto)", data):
        nom = m.group(2)
        if len(nom) != m.group(1)[0] or not FILTRE.search(nom):
            continue
        fins = decouper(data, m.start())
        # Retire des champs en fin tant que le parsing échoue (octets parasites)
        while fins:
            try:
                fdp = descriptor_pb2.FileDescriptorProto.FromString(data[m.start():fins[-1]])
                if fdp.message_type or fdp.service:
                    ancien = fichiers.get(fdp.name)
                    if ancien is None or ancien.ByteSize() < fdp.ByteSize():
                        fichiers[fdp.name] = fdp
                break
            except Exception:
                fins.pop()
    return fichiers


# ---------- rendu .proto lisible ----------
TYPES = {v: k[5:].lower() for k, v in descriptor_pb2.FieldDescriptorProto.Type.items()}
LABELS = {1: "optional ", 2: "required ", 3: "repeated "}


def rendu_enum(e, ind):
    out = [f"{ind}enum {e.name} {{"]
    out += [f"{ind}  {v.name} = {v.number};" for v in e.value]
    return out + [f"{ind}}}"]


def rendu_champ(c, ind, syntaxe3):
    t = c.type_name.lstrip(".") if c.type_name else TYPES[c.type]
    label = LABELS[c.label]
    if syntaxe3 and c.label == 1 and not c.proto3_optional:
        label = ""
    return f"{ind}{label}{t} {c.name} = {c.number};"


def rendu_message(m, ind, syntaxe3):
    out = [f"{ind}message {m.name} {{"]
    for e in m.enum_type:
        out += rendu_enum(e, ind + "  ")
    for n in m.nested_type:
        if not n.options.map_entry:
            out += rendu_message(n, ind + "  ", syntaxe3)
    oneofs = {}
    for c in m.field:
        if c.HasField("oneof_index") and not c.proto3_optional:
            oneofs.setdefault(c.oneof_index, []).append(c)
        else:
            out.append(rendu_champ(c, ind + "  ", syntaxe3))
    for r in m.reserved_range:  # numéros réservés (champs supprimés par CIG)
        fin = "max" if r.end >= 536870912 else r.end - 1
        out.append(f"{ind}  reserved {r.start}" + ("" if fin == r.start else f" to {fin}") + ";")
    if m.reserved_name:
        out.append(f"{ind}  reserved " + ", ".join(f'"{n}"' for n in m.reserved_name) + ";")
    for i, champs in oneofs.items():
        out.append(f"{ind}  oneof {m.oneof_decl[i].name} {{")
        out += [rendu_champ(c, ind + "    ", syntaxe3) for c in champs]
        out.append(f"{ind}  }}")
    return out + [f"{ind}}}"]


def rendu_fichier(f):
    s3 = f.syntax == "proto3"
    out = [f"// {f.name}", f'syntax = "{f.syntax or "proto2"}";', f"package {f.package};", ""]
    out += [f'import "{d}";' for d in f.dependency]
    for e in f.enum_type:
        out += rendu_enum(e, "")
    for m in f.message_type:
        out += rendu_message(m, "", s3) + [""]
    for s in f.service:
        out.append(f"service {s.name} {{")
        for r in s.method:
            ss = "stream " if r.server_streaming else ""
            cs = "stream " if r.client_streaming else ""
            out.append(f"  rpc {r.name}({cs}{r.input_type.lstrip('.')}) returns ({ss}{r.output_type.lstrip('.')});")
        out.append("}")
    return "\n".join(out)


# ---------- comparaison ----------
def tous_les_champs(fichiers):
    res = {}

    def parcourir(m, prefixe):
        nom = f"{prefixe}.{m.name}"
        for c in m.field:
            res[(nom, c.number)] = c.name
        for n in m.nested_type:
            parcourir(n, nom)

    for f in fichiers:
        for m in f.message_type:
            parcourir(m, f.package)
    return res


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    with open(sys.argv[1], "rb") as fh:
        data = fh.read()
    fichiers = extraire(data)
    if not fichiers:
        sys.exit("Aucun descripteur 'telemetry' trouvé dans l'exécutable "
                 "(le jeu utilise peut-être protobuf-lite, sans schéma embarqué).")

    print("Fichiers .proto trouvés :")
    for n, f in fichiers.items():
        print(f"  - {n}  ({len(f.message_type)} messages, {len(f.service)} services)")

    fds = descriptor_pb2.FileDescriptorSet(file=list(fichiers.values()))
    with open("sc_extrait.desc", "wb") as fh:
        fh.write(fds.SerializeToString())
    with open("sc_extrait.proto", "w", encoding="utf-8") as fh:
        fh.write("\n\n".join(rendu_fichier(f) for f in fichiers.values()))
    print("\nÉcrit : sc_extrait.desc et sc_extrait.proto")

    manquants = [d for f in fichiers.values() for d in f.dependency
                 if d not in fichiers and not d.startswith("google/protobuf/")]
    if manquants:
        print("Attention, dépendances non extraites :", ", ".join(sorted(set(manquants))))

    if "--compare" in sys.argv:
        ref = descriptor_pb2.FileDescriptorSet.FromString(
            open(sys.argv[sys.argv.index("--compare") + 1], "rb").read())
        a, b = tous_les_champs(fichiers.values()), tous_les_champs(ref.file)
        nouveaux = sorted(k for k in a if k not in b)
        print(f"\n{len(nouveaux)} champ(s) présents dans le jeu mais absents du schéma communautaire :")
        for msg, num in nouveaux:
            print(f"  {msg}.{a[(msg, num)]} = {num}")


if __name__ == "__main__":
    main()
