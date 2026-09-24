FROM rust:1-slim-bookworm AS dev
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev curl && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-watch
WORKDIR /app
EXPOSE 8080
CMD ["cargo", "watch", "-x", "run -p server"]

FROM rust:1-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN cargo build --release -p server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server /usr/local/bin/server
EXPOSE 8080
CMD ["server"]
