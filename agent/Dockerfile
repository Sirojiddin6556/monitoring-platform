FROM golang:1.22-alpine AS builder

ARG TARGETOS=linux
ARG TARGETARCH=amd64

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/monitoring-agent .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates docker-cli

WORKDIR /app
COPY --from=builder /out/monitoring-agent /app/monitoring-agent
COPY VERSION /app/VERSION

ENV INTERVAL=15

ENTRYPOINT ["/app/monitoring-agent"]
