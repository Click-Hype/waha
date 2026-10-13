# Perfil NOWEB da NooviCrew

`Dockerfile.noweb` compila um perfil que admite somente NOWEB. A configuração,
a fábrica de sessões e o entrypoint recusam GOWS, WEBJS, WPP e valores desconhecidos
antes de iniciar uma sessão. `supportedEngines` informa a capacidade do artefato.
O `Dockerfile` e o entrypoint legados conservam o perfil com múltiplas engines.

A receita usa o contexto do fork e dois contextos nomeados: `build_recipe`, com as
receitas e chaveiros versionados do OS em `deploy/build`, e `build_sources`, com
os blobs públicos verificados pelo downloader/lock do OS. O publicador do OS fixa
os digests `NODE_IMAGE` e `ALPINE_IMAGE`; `SOURCE_COMMIT` identifica o commit do fork.
Não são necessários contextos privados de overlay ou secrets para a build.

O lock foi gerado pelo Yarn 4.17.1 no Node 24.21.0 e conferido com replay imutável.
`build/provenance/noweb-lock-toolchain.json` conserva essa origem; ele não declara
as vulnerabilidades corrigidas nem aprova o runtime. A build compila o grafo completo,
faz focus de produção preservando os metadados/lock e usa Sharp compilado com Vips
do sistema. Expat, Vips e FFmpeg mantêm pacotes genuínos, licenças, documentos e trust.

Os checks obrigatórios usam arquivos e chaves sintéticos, sem rede: binding better-sqlite3 (SQLite 3.53.2+, sem o pacote `sqlite3`),
reabertura das migrations NOWEB, formatos de imagem, conversores reais de voz/vídeo
e vetores do ratchet. A consulta do vendor Opus usa `opustags --vendor`, exigindo
`Recorder` exato e ausência de comentários `ENCODER`. Falha impede a imagem final.

O perfil permanece `unhomologated`. Os vetores conservam explícito o bypass de
assinatura inicial do upstream; não aprovam a autenticação do signed prekey inicial.
Build/checks locais não aprovam QR, número de cliente, recebimento/HMAC, conexão real,
semântica de outra engine, boot com PostgreSQL, scans ou produção. Essas etapas usam
os gates do OS e recibos ligados à fonte e à imagem exatas.
