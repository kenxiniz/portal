FROM certbot/certbot:latest
RUN apk add --no-cache bash coreutils docker-cli
COPY renew.sh /usr/local/bin/renew.sh
RUN chmod +x /usr/local/bin/renew.sh
ENTRYPOINT ["/bin/bash", "/usr/local/bin/renew.sh"]
