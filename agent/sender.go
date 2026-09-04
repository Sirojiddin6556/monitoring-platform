package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type Sender struct {
	cfg    Config
	client *http.Client

	mu     sync.Mutex
	buffer []json.RawMessage
}

func NewSender(cfg Config) *Sender {
	transport := &http.Transport{
		MaxIdleConnsPerHost: 2,
		IdleConnTimeout:     90 * time.Second,
	}
	return &Sender{
		cfg: cfg,
		client: &http.Client{
			Transport: transport,
			Timeout:   20 * time.Second,
		},
	}
}

// Send flushes one buffered payload first, then sends the current payload.
// On failure the current payload is queued in the offline buffer.
func (s *Sender) Send(p *Payload, bufLen *int) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	// Flush one buffered payload (older data → chronological order on backend).
	s.mu.Lock()
	var pending json.RawMessage
	if len(s.buffer) > 0 {
		pending = s.buffer[0]
	}
	s.mu.Unlock()

	if pending != nil {
		if postErr := s.post(pending); postErr == nil {
			s.mu.Lock()
			if len(s.buffer) > 0 {
				s.buffer = s.buffer[1:]
			}
			remaining := len(s.buffer)
			s.mu.Unlock()
			log.Printf("[agent] flushed 1 buffered payload (%d remaining)", remaining)
		}
	}

	// Send current payload.
	if postErr := s.post(raw); postErr != nil {
		s.enqueue(raw)
		*bufLen = s.bufLen()
		log.Printf("[agent] WARNING: post error: %v (buffered=%d)", postErr, *bufLen)
		return postErr
	}

	s.writeHeartbeat(p.Timestamp)
	*bufLen = s.bufLen()
	log.Printf("[agent] sent  server=%s cpu=%.1f%% ram=%.1f%%",
		p.ServerID, p.CPUDetail.Percent, p.RAMDetail.Percent)
	return nil
}

func (s *Sender) post(raw json.RawMessage) error {
	url := s.cfg.BackendURL + "/api/metrics"

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		if s.cfg.IngestKey != "" {
			req.Header.Set("X-Ingest-Key", s.cfg.IngestKey)
		}

		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			break // client error — no point retrying
		}
	}
	return lastErr
}

func (s *Sender) enqueue(raw json.RawMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.buffer) >= maxBuffer {
		s.buffer = s.buffer[1:]
		log.Printf("[agent] WARNING: send buffer full (%d) – oldest payload dropped", maxBuffer)
	}
	s.buffer = append(s.buffer, raw)
}

func (s *Sender) bufLen() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.buffer)
}

func (s *Sender) writeHeartbeat(ts int64) {
	data := fmt.Sprintf(`{"ts":%d,"pid":%d,"ok":true}`, ts, os.Getpid())
	tmp := s.cfg.Heartbeat + ".tmp"
	if err := os.WriteFile(tmp, []byte(data), 0644); err == nil {
		if err2 := os.Rename(tmp, s.cfg.Heartbeat); err2 == nil {
			return
		}
	}
	_ = os.WriteFile(s.cfg.Heartbeat, []byte(data), 0644)
}
