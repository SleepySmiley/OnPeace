#!/bin/sh
# OnPeace su Linux e Mac: ./serata.sh per la serata tra amici (sul Mac basta il doppio clic su serata.command).
# Se sul PC non c'è Node 22 o superiore ne scarica una copia solo per OnPeace in .cache/node (ultima 24.x da
# nodejs.org, controllata con lo SHA256 pubblicato; niente installazione nel sistema). Poi npm run serata fa
# il resto: dipendenze se servono, client, server, tunnel e browser. Per aggiornare Node: cancella .cache/node.
# Opzioni come npm run serata, per esempio: ./serata.sh --locale
set -u
cd "$(dirname "$0")" || exit 1

say() { printf '[serata] %s\n' "$*"; }

nodeok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1
}

scarica() { # indirizzo file
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    say 'per scaricare Node serve curl o wget (per esempio: sudo apt install curl)'
    return 1
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

scarica_node() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) say "sistema $(uname -s) non previsto"; return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) arch=$(uname -m) ;;
  esac
  base=https://nodejs.org/dist/latest-v24.x
  mkdir -p .cache || return 1
  scarica "$base/SHASUMS256.txt" .cache/node-SHASUMS256.txt || return 1
  # righe "<sha256>  node-v24.x.y-linux-x64.tar.gz"
  riga=$(grep " node-v[0-9.]*-$os-$arch\.tar\.gz\$" .cache/node-SHASUMS256.txt | head -n 1)
  rm -f .cache/node-SHASUMS256.txt
  if [ -z "$riga" ]; then
    say "nodejs.org non ha Node 24 per $os-$arch"
    return 1
  fi
  sha=${riga%% *}
  file=${riga##* }
  nome=${file%.tar.gz}

  say "scarico $nome (circa 50 MB), una volta sola..."
  scarica "$base/$file" .cache/node-scaricato.tar.gz || return 1
  if [ "$(sha256 .cache/node-scaricato.tar.gz)" != "$sha" ]; then
    rm -f .cache/node-scaricato.tar.gz
    say 'il file scaricato non corrisponde allo SHA256 pubblicato'
    return 1
  fi
  rm -rf .cache/node .cache/node-estrazione
  mkdir .cache/node-estrazione &&
    tar -xzf .cache/node-scaricato.tar.gz -C .cache/node-estrazione &&
    mv ".cache/node-estrazione/$nome" .cache/node
  esito=$?
  rm -rf .cache/node-estrazione .cache/node-scaricato.tar.gz
  [ $esito -eq 0 ] || return 1
  say 'Node pronto in .cache/node'
}

if ! nodeok; then
  if [ ! -x .cache/node/bin/node ]; then
    say 'Node 22 o superiore non trovato: ne scarico una copia solo per OnPeace in .cache/node'
    if ! scarica_node; then
      say 'non riesco a scaricare Node: installalo da https://nodejs.org (versione LTS) e riprova.'
      exit 1
    fi
  fi
  PATH="$PWD/.cache/node/bin:$PATH"
  export PATH
  if ! nodeok; then
    say 'il Node scaricato in .cache/node non parte su questo sistema: installalo da https://nodejs.org e riprova.'
    exit 1
  fi
fi

exec npm run serata -- "$@"
