package main

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

func collectDBs(configStr string) []DBStatus {
	if configStr == "" {
		return []DBStatus{}
	}
	var out []DBStatus
	for _, target := range strings.Split(configStr, ",") {
		target = strings.TrimSpace(target)
		if target == "" {
			continue
		}

		// Try to parse as URL
		u, err := url.Parse(target)
		var dbType, host, name string
		if err == nil && u.Scheme != "" {
			dbType = u.Scheme
			host = u.Host
			name = u.Path
			if name != "" {
				name = strings.TrimPrefix(name, "/")
			} else {
				name = "default"
			}
		} else {
			// Fallback: raw host:port
			dbType = "unknown"
			host = target
			name = target
		}

		// Split port if default is needed
		if !strings.Contains(host, ":") {
			switch dbType {
			case "postgres", "postgresql":
				host = host + ":5432"
			case "mysql":
				host = host + ":3306"
			case "mssql":
				host = host + ":1433"
			case "redis":
				host = host + ":6379"
			default:
				host = host + ":5432"
			}
		}

		start := time.Now()
		conn, err := net.DialTimeout("tcp", host, 3*time.Second)
		elapsed := time.Since(start).Seconds() * 1000.0

		status := "inactive"
		if err == nil {
			status = "active"
			conn.Close()
		}

		out = append(out, DBStatus{
			Name:      name,
			Type:      dbType,
			Status:    status,
			LatencyMs: round2(elapsed),
		})
	}
	return out
}

func collectNetEquip(configStr string) []NetEquipStatus {
	if configStr == "" {
		return []NetEquipStatus{}
	}
	var out []NetEquipStatus
	for _, part := range strings.Split(configStr, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		ip := part
		name := part
		if idx := strings.IndexByte(part, ':'); idx > 0 {
			ip = strings.TrimSpace(part[:idx])
			name = strings.TrimSpace(part[idx+1:])
		}

		// Clean name or default to IP
		if name == "" {
			name = ip
		}

		// Dial TCP port 80/22/443 or generic ping
		host := ip
		if !strings.Contains(host, ":") {
			host = host + ":80" // Default Web port for routers/switches management
		}

		start := time.Now()
		conn, err := net.DialTimeout("tcp", host, 2*time.Second)
		elapsed := time.Since(start).Seconds() * 1000.0

		status := "down"
		if err == nil {
			status = "up"
			conn.Close()
		} else {
			// Fallback: Try port 22 (SSH)
			sshHost := ip
			if !strings.Contains(sshHost, ":") {
				sshHost = sshHost + ":22"
			}
			connSSH, errSSH := net.DialTimeout("tcp", sshHost, 2*time.Second)
			if errSSH == nil {
				status = "up"
				connSSH.Close()
			}
		}

		out = append(out, NetEquipStatus{
			Name:      name,
			IP:        ip,
			Status:    status,
			LatencyMs: round2(elapsed),
		})
	}
	return out
}

func collectSSLCerts(configStr string) []SSLCertStatus {
	if configStr == "" {
		return []SSLCertStatus{}
	}
	var out []SSLCertStatus
	for _, domain := range strings.Split(configStr, ",") {
		domain = strings.TrimSpace(domain)
		if domain == "" {
			continue
		}

		// Strip HTTP/HTTPS schema if present
		cleanDomain := domain
		if strings.HasPrefix(cleanDomain, "https://") {
			cleanDomain = strings.TrimPrefix(cleanDomain, "https://")
		} else if strings.HasPrefix(cleanDomain, "http://") {
			cleanDomain = strings.TrimPrefix(cleanDomain, "http://")
		}

		// Remove path and query
		if idx := strings.IndexByte(cleanDomain, '/'); idx > 0 {
			cleanDomain = cleanDomain[:idx]
		}
		if idx := strings.IndexByte(cleanDomain, ':'); idx > 0 {
			cleanDomain = cleanDomain[:idx]
		}

		address := fmt.Sprintf("%s:443", cleanDomain)
		conf := &tls.Config{
			InsecureSkipVerify: true, // We still want to inspect the certificate even if expired/invalid
		}

		dialer := &net.Dialer{
			Timeout: 4 * time.Second,
		}

		start := time.Now()
		conn, err := tls.DialWithDialer(dialer, "tcp", address, conf)
		_ = start

		if err != nil {
			out = append(out, SSLCertStatus{
				Domain:    domain,
				Status:    "invalid",
				DaysLeft:  0,
				Issuer:    "unknown",
				ExpiresAt: "N/A",
			})
			continue
		}

		state := conn.ConnectionState()
		conn.Close()

		if len(state.PeerCertificates) == 0 {
			out = append(out, SSLCertStatus{
				Domain:    domain,
				Status:    "invalid",
				DaysLeft:  0,
				Issuer:    "unknown",
				ExpiresAt: "N/A",
			})
			continue
		}

		cert := state.PeerCertificates[0]
		daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
		expiresAt := cert.NotAfter.Format("2006-01-02 15:04:05")
		issuer := cert.Issuer.CommonName
		if issuer == "" && len(cert.Issuer.Organization) > 0 {
			issuer = cert.Issuer.Organization[0]
		}

		status := "valid"
		if daysLeft <= 0 {
			status = "expired"
		} else if daysLeft < 15 {
			status = "expiring"
		}

		out = append(out, SSLCertStatus{
			Domain:    domain,
			Status:    status,
			DaysLeft:  daysLeft,
			Issuer:    issuer,
			ExpiresAt: expiresAt,
		})
	}
	return out
}
