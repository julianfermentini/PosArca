package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// nuevoRouter arma un router con el rate limiter y sin confiar en proxies, igual
// que producción, para que la IP salga del XFF o del RemoteAddr según el caso.
func nuevoRouter(rps float64, burst int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(RateLimit(rps, burst))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

func TestRateLimit_AllowsBurstThenBlocks(t *testing.T) {
	r := nuevoRouter(1, 3) // 1 req/s sostenido, ráfaga de 3

	do := func() int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "1.2.3.4:5555"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	for i := 0; i < 3; i++ {
		if code := do(); code != http.StatusOK {
			t.Fatalf("request %d dentro de la ráfaga: esperaba 200, dio %d", i+1, code)
		}
	}
	if code := do(); code != http.StatusTooManyRequests {
		t.Fatalf("request fuera de la ráfaga: esperaba 429, dio %d", code)
	}
}

// TestRateLimit_PerIPIndependent agota una IP y verifica que OTRA IP conserva su
// propio presupuesto — probando el aislamiento de verdad, no sólo que la primera
// request de cada IP pase.
func TestRateLimit_PerIPIndependent(t *testing.T) {
	r := nuevoRouter(1, 1) // burst 1: la 2ª request de una IP se bloquea

	call := func(ip string) int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = ip + ":1234"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := call("1.1.1.1"); code != http.StatusOK {
		t.Fatalf("IP1 primer request: esperaba 200, dio %d", code)
	}
	if code := call("1.1.1.1"); code != http.StatusTooManyRequests {
		t.Fatalf("IP1 segundo request: esperaba 429, dio %d", code)
	}
	if code := call("2.2.2.2"); code != http.StatusOK {
		t.Fatalf("IP2 debería tener su propio bucket: esperaba 200, dio %d", code)
	}
}

// TestRateLimit_XFFNoSpoofable prueba el fix central: detrás del proxy, la IP real
// es el valor rightmost del X-Forwarded-For. Un atacante que rota el valor que él
// controla (a la izquierda) no debe conseguir un bucket nuevo por request.
func TestRateLimit_XFFNoSpoofable(t *testing.T) {
	r := nuevoRouter(1, 1)

	call := func(spoofed string) int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "10.0.0.1:1234"                          // el "proxy" de Railway
		req.Header.Set("X-Forwarded-For", spoofed+", 200.1.1.1")  // real = rightmost
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := call("1.1.1.1"); code != http.StatusOK {
		t.Fatalf("primer request: esperaba 200, dio %d", code)
	}
	// Cambia el valor spoofeado, pero la IP real (rightmost) es la misma → 429.
	if code := call("9.9.9.9"); code != http.StatusTooManyRequests {
		t.Fatalf("spoofear el XFF no debe crear un bucket nuevo: esperaba 429, dio %d", code)
	}
}
