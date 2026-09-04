package main

import (
	"sync"
	"time"
)

type cacheEntry[T any] struct {
	val T
	at  time.Time
}

type Cache[T any] struct {
	mu       sync.Mutex
	entries  map[string]cacheEntry[T]
	inflight map[string]*sync.WaitGroup
}

func NewCache[T any]() *Cache[T] {
	return &Cache[T]{
		entries:  make(map[string]cacheEntry[T]),
		inflight: make(map[string]*sync.WaitGroup),
	}
}

// Get returns cached value if fresh (within ttl). Otherwise calls fn once;
// concurrent callers wait for the single in-flight call to finish.
func (c *Cache[T]) Get(key string, ttl time.Duration, fn func() T) T {
	c.mu.Lock()
	if e, ok := c.entries[key]; ok && time.Since(e.at) < ttl {
		c.mu.Unlock()
		return e.val
	}
	if wg, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		wg.Wait()
		c.mu.Lock()
		val := c.entries[key].val
		c.mu.Unlock()
		return val
	}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	c.inflight[key] = wg
	c.mu.Unlock()

	val := fn()

	c.mu.Lock()
	c.entries[key] = cacheEntry[T]{val: val, at: time.Now()}
	delete(c.inflight, key)
	c.mu.Unlock()
	wg.Done()
	return val
}
