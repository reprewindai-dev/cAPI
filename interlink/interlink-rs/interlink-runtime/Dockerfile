# Build stage
FROM rust:1.75-slim as builder

WORKDIR /usr/src/app
COPY . .

# Build the runtime
# We need to build from the workspace root or ensure paths are correct
# Since we are in interlink-runtime, we copy the whole interlink-rs
WORKDIR /usr/src/app/interlink-runtime
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/interlink-runtime /usr/local/bin/interlink-runtime

EXPOSE 8080

CMD ["interlink-runtime"]
