# Build stage
FROM rust:1.75-slim as builder

WORKDIR /usr/src/app
# Copy the entire workspace
COPY . .

# Build the runtime crate
RUN cargo build --release -p interlink-runtime

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/interlink-runtime /usr/local/bin/interlink-runtime

ENV RUST_LOG=info
EXPOSE 3000

CMD ["interlink-runtime"]
