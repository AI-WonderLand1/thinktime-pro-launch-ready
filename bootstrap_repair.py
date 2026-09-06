from pathlib import Path
import hashlib

ALPHABET = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
SPECS = {
    "04": {
        "git": "b6eb1e0356f3b809fa76e18d51e9076f7bf3c469",
        "blocks": [
            (256,"892c7b694ff8783a520278ef93b4130e0bc0b61ff7dda137e41bd221c23f84eb"),(256,"517fc6ffe80092cc0b12caf8531ddeaf928743e31ce506f283ea817f8d93c3dd"),(256,"22cd6af55125634dae171733d03ba1b715f24e8dddaadaa1d4fc41ba77d8a5e7"),(256,"7510b1ef78af7e0a796f351d9f3aff8d0f33244c4df58c04fc886d1704b4091b"),(256,"dd23269046ab9981e3b9e2835c4985625411391efdbc78419e3d853c5c6aa509"),(256,"95acb0ef4245aee6b8adc1fb5c67a66b4aa5168f275a0162ca2cf2cf819ebe8c"),(256,"2ee7edede05a21484266a0fd6f175301b8fec12e034e13adb976c22407e48a0d"),(256,"340554611b0c650849a8bfa29b8a584026ed51a0544e5114bb0c2f33bcf17cff"),(256,"23d61a1f0d11fce8698dd09bd3565616db1f5c17b761a4eaa44d0a8e5f033923"),(256,"1952dae615e8c9eb91ec086fe85b49c89907ff552917c3e2c6e7e75eed512702"),(256,"38d1e0ebbfe76905652ac59eb9661aeccc7fc3b6741d657d1f6451fffce510ae"),(256,"0a5c43165cff260003a5a4e0313014010102fab0bc0609ca21652d636ef97927"),(256,"865e5c07ca999cbd3f8271622fb87700fed095cb029f63e5f7142791d9615d1a"),(256,"31e46c21913f67f68e5a4d8f7cf8d54fa7216c8c497a6da25fde31380d0c6e41"),(256,"05925bb268b6ab119989eaa7c659193299e92d6b9a8e393d4998579c23376288"),(256,"d34cb335b03c2b0e523fb5582e1ba05994ec1344d7f7c9f5eafa486eb3a781ef"),(256,"fe3f39d39af6e186119f73c4226cb7514e27566426a9b9ef382c5e5d881842e8"),(256,"39d7e10fc36f649ed06c84ab174616f7e1b7565ded660e6b73c0126d8bb7b36f"),(256,"27d72ccc18aecd17fc75e995323bb3d98b70125b1594e7156a2a469cc0701e74"),(256,"33e95750d3a722de329fa3483e043fb1f14180398271b6ace9db6da11b3a0430"),(256,"3ab7607976fc25e133f071adfed62e11e2e42971c9226b025c999a941d500d73"),(256,"5c54a18446420afde407aad4a7fbc9f67f0f20b472b314b18e4e59e4ac23f837"),(256,"0dd385c111f9d0c5da4a4f4498f944d4b99c04eb00d230960cf01d1880a98cb2"),(256,"fcb0e158ce71736ee9f4eb3e4fff7580283e2742346db00220505e5a0f1ead96"),(256,"1f0055fe2ff51e1eb98af8b1b6c11f9e6c1423aeef4d60f9fc74c37486d437a5"),(256,"61fda27d479a47ded9157a43de138010db82296b8264567058e331d30df28935"),(256,"dbb143c43f613920b6036d66839a494053f06815a393334178ac3ba302a15b4d"),(256,"fa60575063191a2a051eee627fd9deb5a0e96a653e310e59f65e1e2ea187f4f2"),(256,"b08a9dfa17293a8a086ed3a032563e07d6bea69d92fba38cd69b6a0c97a3a35b"),(256,"7b4067e2fbf595c66cc0d1f14ed63e16742830149db0af90e0334d56a92f5086"),(256,"d11150cf9d41812bebdad51193d8e8f3682c5def6753de908b2eca8991eb0f22"),(256,"767e15055e4068135e2315ea1dc3b65588050dec71d609d2213d861f31f8253e"),(256,"dbe1cfdec491e7bf4e6fce07d2f559a68527719260e54c3ec7100dc7b371dbc0"),(256,"a616194960496fb4c965a7eab85d9252f1027311b272be49c0451fb47a545df4"),(256,"d8542d230fd396a8d67b4c21b2355fb3e09e41f325b0e0700d202dfaae63af4d"),(40,"aad232580233c22d358d70c6800e904ca1561401e6a55c05df6bcb22e6bc591d")
        ],
    },
    "09": {
        "git": "e627c2f009c560e8d5d3037e076fe2efb617c616",
        "blocks": [
            (256,"961a09c6d164d4afa904258e0617398fda387e3cd46832dc21060d23f09ab1c7"),(256,"3c91fa0d2922641041529da1090eca1fd165e9214860e01209d515d2e04ffe31"),(256,"e710c820295e0e4dfeb83515ceaa8465f38f197b6212fdf939c771fa5513e16e"),(256,"83f1108f845b20b75b150781ec37640070a3a3b2810504da1639452b461e5c5a"),(256,"ca446d1d0b5bd72fdbf110b061810c93d8b03c7898f7c92a26f07ba419d689be"),(256,"b575b67fd76c4c2ffe0ec9106b697475d9f319b4360b3021cc1211a92d84c5fb"),(256,"c37b931647be4baaee5b8aafba711fd7ce53ec950ee3a331681ac460960d199d"),(256,"5975befd065118026af8e413bb51ea6bc8f8640a10d7a491c0d60a4b6ab53657"),(256,"1ea7a292d67dbe5f736442f2cf0254773338e0b71d6ad9539abcb611257f3223"),(256,"b272e233fa07cd65dbbf6f22ebff6ede99ed73ca00d8c0e42487684031de97d6"),(256,"e6f748f5f63f1b70e2972f7699fbf4d883a2e4dbc775dcbe9e172d3530ee3755"),(80,"6ed0a8eea208bd2acc29a778860f16759dd39f354a56b1c0799d8747155f135f")
        ],
    },
}

def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()

def repair_substitution(block: bytes, expected_hash: str, label: str) -> bytes:
    if hashlib.sha256(block).hexdigest() == expected_hash:
        return block
    for pos in range(len(block)):
        original = block[pos]
        for ch in ALPHABET:
            if ch == original:
                continue
            candidate = block[:pos] + bytes((ch,)) + block[pos + 1:]
            if hashlib.sha256(candidate).hexdigest() == expected_hash:
                print(f"{label}: repaired substitution at offset {pos}")
                return candidate
    raise SystemExit(f"{label}: mismatch is not a single-character substitution")

def repair(path: Path, spec: dict) -> None:
    data = path.read_bytes()
    expected_len = sum(length for length, _ in spec["blocks"])
    if git_blob_sha(data) == spec["git"]:
        print(f"{path.name}: already exact")
        return
    if len(data) == expected_len - 1:
        offset = 0
        inserted = False
        for block_index, (length, expected_hash) in enumerate(spec["blocks"]):
            intact = data[offset:offset + length]
            if len(intact) == length and hashlib.sha256(intact).hexdigest() == expected_hash:
                offset += length
                continue
            damaged = data[offset:offset + length - 1]
            for pos in range(length):
                for ch in ALPHABET:
                    candidate = damaged[:pos] + bytes((ch,)) + damaged[pos:]
                    if hashlib.sha256(candidate).hexdigest() == expected_hash:
                        data = data[:offset] + candidate + data[offset + length - 1:]
                        print(f"{path.name}: repaired deletion in block {block_index} at offset {pos}")
                        inserted = True
                        break
                if inserted:
                    break
            if not inserted:
                raise SystemExit(f"{path.name}: could not repair deletion in block {block_index}")
            break
        if not inserted:
            raise SystemExit(f"{path.name}: missing character not located")
    elif len(data) != expected_len:
        raise SystemExit(f"{path.name}: unexpected length {len(data)}")

    fixed = bytearray()
    offset = 0
    for block_index, (length, expected_hash) in enumerate(spec["blocks"]):
        block = data[offset:offset + length]
        fixed.extend(repair_substitution(block, expected_hash, f"{path.name} block {block_index}"))
        offset += length
    data = bytes(fixed)
    actual = git_blob_sha(data)
    if actual != spec["git"]:
        raise SystemExit(f"{path.name}: final blob hash {actual} != {spec['git']}")
    path.write_bytes(data)
    print(f"{path.name}: exact blob restored")

for suffix, spec in SPECS.items():
    repair(Path(f".bootstrap/chunk-{suffix}.b64"), spec)
