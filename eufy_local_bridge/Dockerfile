FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS connector
WORKDIR /sdk
COPY connector-amd64.tar.gz connector-amd64.tar.gz.sha256 ./
RUN sha256sum -c connector-amd64.tar.gz.sha256 && tar xzf connector-amd64.tar.gz

FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
RUN apk --no-cache upgrade && apk add --no-cache ca-certificates coreutils ffmpeg libdatachannel nodejs openssl
RUN mkdir -p /opt/eufy-install/homeassistant && chmod 0700 /opt/eufy-install
WORKDIR /usr/src/app
COPY --from=connector /sdk/node_modules ./node_modules
COPY THIRD_PARTY.md /usr/share/doc/eufy-local-bridge/THIRD_PARTY.md
RUN node -e "require('node-datachannel')" && test -f node_modules/eufy-security-ws/dist/bin/server.js
COPY runtime/ /app/
COPY api.mjs run.mjs install-component.mjs /app/home-assistant/addon/
COPY component/ /opt/eufy-component/
COPY runtime/eufy-login.mjs runtime/session-vault.mjs /opt/bridge/
ENTRYPOINT ["node", "/app/home-assistant/addon/run.mjs"]
