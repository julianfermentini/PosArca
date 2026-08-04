package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// clientIP devuelve la IP real del cliente detrás del proxy de Railway.
//
// Railway pone al backend detrás de exactamente un proxy que agrega la IP del
// cliente al FINAL de X-Forwarded-For. Por eso tomamos el valor más a la derecha:
// es el único que estampa el proxy y que el cliente no puede falsificar —
// cualquier valor que el atacante mande en el header queda a la izquierda del que
// agrega Railway, así que rotarlo no crea buckets nuevos.
//
// Si algún día Railway sumara otra capa de proxy, el rightmost pasaría a ser una
// IP interna fija (todos compartirían bucket) y habría que tomar el penúltimo.
// Verificable mirando el XFF real que llega en los logs.
func clientIP(c *gin.Context) string {
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	// Sin proxy (dev local): la IP directa de la conexión.
	return c.ClientIP()
}

// visitor guarda el limiter de una IP y cuándo se la vio por última vez, para
// poder descartar entradas inactivas y que el mapa no crezca indefinidamente.
type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimit limita a rps peticiones por segundo (con ráfagas de hasta burst)
// por IP de origen. Protege endpoints sensibles a fuerza bruta o a costo de CPU
// (bcrypt) — login, registro y el panel de admin, que sólo están protegidos por
// una contraseña/secret sin ningún otro freno a los intentos.
//
// El estado vive en memoria de proceso: alcanza porque el backend corre en una
// sola instancia. Si algún día se escala horizontalmente, esto hay que moverlo
// a la base de datos o a Redis, igual que ya se hizo con el cache de token ARCA.
func RateLimit(rps float64, burst int) gin.HandlerFunc {
	var mu sync.Mutex
	visitors := make(map[string]*visitor)

	go func() {
		ticker := time.NewTicker(time.Minute)
		for range ticker.C {
			mu.Lock()
			for ip, v := range visitors {
				if time.Since(v.lastSeen) > 3*time.Minute {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := clientIP(c)

		mu.Lock()
		v, ok := visitors[ip]
		if !ok {
			v = &visitor{limiter: rate.NewLimiter(rate.Limit(rps), burst)}
			visitors[ip] = v
		}
		v.lastSeen = time.Now()
		limiter := v.limiter
		mu.Unlock()

		if !limiter.Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"success": false, "error": "Demasiados intentos. Esperá un minuto e intentá de nuevo.",
			})
			return
		}
		c.Next()
	}
}
